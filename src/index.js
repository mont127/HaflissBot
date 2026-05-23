const {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  SlashCommandBuilder
} = require("discord.js");
require("./logger");
const { getLogs } = require("./logger");
const { generateMentionReply } = require("./chat/localModel");
const { config } = require("./config");
const { shouldDeleteFlaggedMessage } = require("./moderation/actions");
const { analyzeTextWithAI } = require("./moderation/aiScore");
const { analyzeImageAttachment, isImageAttachment } = require("./moderation/images");
const { analyzeLinks } = require("./moderation/links");
const { mergeResults } = require("./moderation/result");

if (!config.discordToken) {
  console.error("Missing DISCORD_TOKEN. Copy .env.example to .env and add your bot token.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message]
});

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);

  await readyClient.application.commands.set([
    new SlashCommandBuilder()
      .setName("log")
      .setDescription("Affiche les derniers logs du bot (admin only)")
      .addIntegerOption((opt) =>
        opt.setName("lines").setDescription("Nombre de lignes à afficher (max 50)").setMinValue(1).setMaxValue(50)
      )
      .toJSON()
  ]);
});

function moderationReplyText(result) {
  return result.flags.includes("bad_speech") ? "T'ES PUNI" : `Calme le post: ${result.summary}`;
}

async function sendModLog(message, result) {
  if (!config.modLogChannelId) return;

  const channel = await message.client.channels.fetch(config.modLogChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  const jumpUrl = message.url || "no message link";
  await channel.send({
    content: [
      `Signalement: ${result.flags.join(", ")}`,
      `Auteur: ${message.author.tag} (${message.author.id})`,
      `Salon: ${message.channel}`,
      `Score: ${result.score}`,
      `Raisons: ${result.reasons.join(", ")}`,
      `Message: ${jumpUrl}`
    ].join("\n")
  });
}

async function handleFlaggedMessage(message, result) {
  await sendModLog(message, result);

  const isOwner = message.guild?.ownerId === message.author.id;

  if (isOwner) {
    await message.channel.send("Respectez le roi klt.");
    return;
  }

  const isBadSpeech = result.flags.includes("bad_speech");

  if (config.replyToFlaggedMessages) {
    await message.reply({
      content: moderationReplyText(result),
      allowedMentions: { repliedUser: false }
    });
  }

  if (isBadSpeech && message.guild) {
    const botMember = await message.guild.members.fetchMe().catch(() => null);
    const canTimeout = botMember?.permissions.has(PermissionsBitField.Flags.ModerateMembers);

    if (canTimeout) {
      const member = await message.guild.members.fetch(message.author.id).catch(() => null);
      await member?.timeout(30 * 60 * 1000, "bad speech détecté par l'IA").catch((error) => {
        console.warn(`Could not timeout ${message.author.tag}:`, error.message);
      });
    }
  }

  const shouldDelete = shouldDeleteFlaggedMessage(result, config);

  if (!shouldDelete || !message.guild) return;

  const botMember = await message.guild.members.fetchMe().catch(() => null);
  const canDelete = botMember?.permissionsIn(message.channel).has(PermissionsBitField.Flags.ManageMessages);

  if (!canDelete) {
    console.warn(
      `Cannot delete ${result.flags.join(", ")} message ${message.id}: missing Manage Messages in ${message.channelId}`
    );
    return;
  }

  await message.delete().catch((error) => {
    console.warn(`Could not delete flagged message ${message.id}:`, error.message);
  });
}

async function analyzeAttachments(message) {
  const checks = [];

  for (const attachment of message.attachments.values()) {
    if (!isImageAttachment(attachment)) continue;

    checks.push(
      analyzeImageAttachment(attachment, config).catch((error) => ({
        flagged: false,
        flags: [],
        score: 0,
        reasons: [`analyse image impossible: ${error.message}`],
        summary: "erreur image"
      }))
    );
  }

  return Promise.all(checks);
}

function isMentioningBot(message) {
  return Boolean(client.user?.id && message.mentions.users.has(client.user.id));
}

function isAdmin(member) {
  return member?.permissions.has(PermissionsBitField.Flags.ModerateMembers);
}

async function handleMuteCommand(message) {
  if (!isMentioningBot(message)) return false;

  const muteMatch = message.content.match(/\bMUTE\b/i);
  if (!muteMatch) return false;

  if (!isAdmin(message.member)) return false;

  const targetUser = message.mentions.users.filter((u) => u.id !== client.user.id).first();
  if (!targetUser) return false;

  const targetMember = await message.guild.members.fetch(targetUser.id).catch(() => null);
  if (!targetMember) return false;

  const botMember = await message.guild.members.fetchMe().catch(() => null);
  const canTimeout = botMember?.permissions.has(PermissionsBitField.Flags.ModerateMembers);

  if (!canTimeout) {
    console.warn(`Cannot timeout ${targetUser.tag}: missing Moderate Members permission`);
    return false;
  }

  const thirtyMinutes = 30 * 60 * 1000;
  await targetMember.timeout(thirtyMinutes, `Mute ordonné par ${message.author.tag}`);

  await message.channel.send(
    `T'ES PUNIE <@${targetUser.id}> SOUS ORDRE DE <@${message.author.id}>`
  );

  console.log(`${targetUser.tag} muted 30min by admin ${message.author.tag}`);
  return true;
}

async function handleMentionReply(message) {
  if (!config.enableAiReplies || !isMentioningBot(message)) return false;

  console.log(`AI mention received from ${message.author.tag} in #${message.channel?.name || message.channelId}`);
  await message.channel.sendTyping().catch(() => {});
  const reply = await generateMentionReply({
    message,
    botUserId: client.user.id,
    config
  });

  await message.reply({
    content: reply.text,
    allowedMentions: { repliedUser: false }
  });

  if (!reply.ok) {
    console.warn(`Local AI reply fallback used for message ${message.id}`);
  }

  console.log(`AI mention answered for message ${message.id}`);
  return true;
}

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.inGuild()) return;

  const thresholds = {
    scamThreshold: config.scamThreshold,
    badWritingThreshold: config.badWritingThreshold,
    badSpeechThreshold: config.badSpeechThreshold,
    customBadSpeechTerms: config.customBadSpeechTerms,
    enableTestTriggers: config.enableTestTriggers
  };

  const textResult = await analyzeTextWithAI(message.content || "", config, thresholds);
  if (!textResult) return;
  const imageResults = await analyzeAttachments(message);
  const linkResult = await analyzeLinks(message.content || "", config);
  const result = mergeResults([textResult, linkResult, ...imageResults]);

  if (result.flagged) {
    console.log(
      `Moderation hit ${result.flags.join(", ")} from ${message.author.tag} in #${message.channel?.name || message.channelId}`
    );
    await handleFlaggedMessage(message, result).catch((error) => {
      console.error(`Failed to handle flagged message ${message.id}:`, error);
    });
    return;
  }

  const muted = await handleMuteCommand(message).catch((error) => {
    console.error(`Failed to handle mute command ${message.id}:`, error);
    return false;
  });
  if (muted) return;

  await handleMentionReply(message).catch((error) => {
    console.error(`Failed to answer mention ${message.id}:`, error);
  });
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "log") return;

  if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ModerateMembers)) {
    await interaction.reply({ content: "T'as pas les droits pour ça.", ephemeral: true });
    return;
  }

  const count = interaction.options.getInteger("lines") ?? 30;
  const lines = getLogs(count);

  if (!lines.length) {
    await interaction.reply({ content: "Aucun log pour l'instant.", ephemeral: true });
    return;
  }

  const block = lines.join("\n");
  const chunks = [];
  for (let i = 0; i < block.length; i += 1900) {
    chunks.push(block.slice(i, i + 1900));
  }

  await interaction.reply({ content: `\`\`\`\n${chunks[0]}\n\`\`\``, ephemeral: true });
  for (const chunk of chunks.slice(1)) {
    await interaction.followUp({ content: `\`\`\`\n${chunk}\n\`\`\``, ephemeral: true });
  }
});

client.login(config.discordToken);
