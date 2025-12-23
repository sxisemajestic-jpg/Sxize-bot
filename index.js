require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Events,
  REST,
  Routes,
  EmbedBuilder
} = require('discord.js');

// ================== CLIENT ==================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// ================== STORAGE ==================
// captId => { maxPlayers, maxSubs, time, players[], subs[], collars[], messageId }
const captStorage = new Map();
const regmpStorage = new Map();

// Хранилище для CD команды /green
// userId => timestamp последней заявки
const greenCooldowns = new Map();

// ================== ФУНКЦИИ ПРОВЕРКИ РОЛЕЙ ==================
function canUseRegmp(member) {
  const allowedRoles = [
    '1438414086588338256',
    '1443874330634227732'
  ];
  return allowedRoles.some(r => member.roles.cache.has(r));
}

// Проверка роли для создания капта
function canCreateCapt(member) {
  const allowedRoles = ['1438414086588338256','1451138364743880883', '1443874330634227732'];
  return allowedRoles.some(roleId => member.roles.cache.has(roleId));
}

// Проверка ролей пользователя
function hasAdminRole(member) {
  return member.roles.cache.has('1438414086588338256') || member.roles.cache.has(process.env.ADMIN_ROLE_ID);
}

// Проверка роли коллера
function hasCollarRole(member) {
  return member.roles.cache.has(process.env.COLLAR_ROLE_ID);
}

// Проверка, имеет ли пользователь иммунитет к CD
function hasGreenCooldownImmunity(member) {
  const immuneRoles = [
    '1002806496326864896',
    '1443874330634227732', 
    '1438414086588338256'
  ];
  return immuneRoles.some(roleId => member.roles.cache.has(roleId));
}

// Проверка CD для команды /green
function checkGreenCooldown(userId) {
  const now = Date.now();
  const lastRequest = greenCooldowns.get(userId);
  
  if (!lastRequest) return null;
  
  const cooldownTime = 25 * 60 * 1000; // 25 минут в миллисекундах
  const timeLeft = lastRequest + cooldownTime - now;
  
  if (timeLeft <= 0) {
    greenCooldowns.delete(userId);
    return null;
  }
  
  return Math.ceil(timeLeft / 1000); // Возвращаем время в секундах
}

// ================== SLASH COMMAND ==================
const commands = [
  new SlashCommandBuilder()
    .setName('capt')
    .setDescription('Создать капт'),
  new SlashCommandBuilder()
    .setName('regmp')
    .setDescription('Запись на ВЗЗ / MCL'),
  new SlashCommandBuilder()
    .setName('green')
    .setDescription('Подать заявку на пакетики Green')
    .addStringOption(option =>
      option.setName('уровень')
        .setDescription('Ваш уровень Green')
        .setRequired(true)
        .addChoices(
          { name: 'Level 1', value: '1' },
          { name: 'Level 2', value: '2' },
          { name: 'Level 3', value: '3' }
        )
    )
].map(cmd => cmd.toJSON());

// ================== REGISTER COMMAND ==================
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );
    console.log('✅ Slash команды зарегистрированы');
  } catch (err) {
    console.error('❌ Ошибка регистрации команд:', err);
  }
})();

// ================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==================
function getCaptIdFromCustomId(customId) {
  const parts = customId.split('_');
  return parts[parts.length - 1];
}

// ================== INTERACTIONS ==================
client.on(Events.InteractionCreate, async interaction => {

if (interaction.isChatInputCommand()) {
  // ---------- /capt ----------
  if (interaction.commandName === 'capt') {
    // Проверяем, есть ли у пользователя разрешенные роли
    if (!canCreateCapt(interaction.member)) {
      return interaction.reply({
        content: '❌ У вас нет прав для создания капта',
        ephemeral: true
      });
    }
    const modal = new ModalBuilder()
      .setCustomId('capt_modal')
      .setTitle('Создание капта');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('players')
            .setLabel('Количество игроков')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('например: 10')
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('subs')
            .setLabel('Максимум замен')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('например: 5')
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('time')
            .setLabel('Время капта')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('например: 15:00')
            .setRequired(true)
        )
      );

      return interaction.showModal(modal);
    }
  // ---------- /regmp ----------
if (interaction.commandName === 'regmp') {
  // Проверяем права
  if (!canUseRegmp(interaction.member)) {
    return interaction.reply({
      content: '❌ У вас нет прав для запуска регистрации ВЗЗ/MCL',
      ephemeral: true
    });
  }

  // Создаем модальное окно
  const modal = new ModalBuilder()
    .setCustomId('regmp_modal')
    .setTitle('Создание регистрации ВЗЗ/MCL');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('event_name')
        .setLabel('Дата и время')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('например: 16.10 в 16:00')
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('description')
        .setLabel('Описание (необязательно)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Дополнительная информация о событии...')
        .setRequired(false)
    )
  );

  return interaction.showModal(modal);
}

  // ---------- /green ----------
  if (interaction.commandName === 'green') {
    const member = interaction.member;
    const userId = member.id;
    const level = interaction.options.getString('уровень');
    
    // Проверяем CD (если у пользователя нет иммунитета)
    if (!hasGreenCooldownImmunity(member)) {
      const cooldown = checkGreenCooldown(userId);
      if (cooldown) {
        const minutes = Math.floor(cooldown / 60);
        const seconds = cooldown % 60;
        return interaction.reply({
          content: `❌ Вы уже подавали заявку. Подождите ещё ${minutes} мин. ${seconds} сек.`,
          ephemeral: true
        });
      }
    }

    // Устанавливаем CD для всех пользователей
    greenCooldowns.set(userId, Date.now());

    // Получаем канал для уведомлений
    const notificationChannelId = '1452747206225432666';
    const notificationChannel = await client.channels.fetch(notificationChannelId).catch(() => null);
    
    if (!notificationChannel) {
      console.error('Канал для уведомлений не найден');
      return interaction.reply({
        content: '❌ Ошибка: канал для уведомлений не найден',
        ephemeral: true
      });
    }

    // Уровни для отображения
    const levelNames = {
      '1': 'Level 1',
      '2': 'Level 2', 
      '3': 'Level 3'
    };

    // Роли для упоминания
    const mentionRoles = '<@&1438937129043361809> <@&1443874330634227732> <@&1438414086588338256>';

    // Создаем embed для красивого сообщения
    const embed = new EmbedBuilder()
      .setColor(0x00FF00) // Зеленый цвет
      .setTitle('📋 Новая заявка на пакетики Green')
      .setDescription(`${mentionRoles}\n\n**Пользователь:** ${member}\n**Уровень:** ${levelNames[level]}`)
      .setTimestamp()
      .setFooter({ text: 'Заявка ждёт галочку(' });

    // Отправляем сообщение в канал уведомлений
    await notificationChannel.send({ embeds: [embed] });

    // Отправляем ответ пользователю
    await interaction.reply({
      content: `${member} Ваша заявка на пакетики Green принята. Ожидайте High состава для выдачи.`,
      ephemeral: true
    });

    console.log(`✅ Заявка на Green от ${member.user.tag} (уровень ${level})`);
    return;
  }
}
  // ---------- MODAL SUBMIT ----------
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'capt_modal') {
      const maxPlayers = Number(interaction.fields.getTextInputValue('players'));
      const maxSubs = Number(interaction.fields.getTextInputValue('subs'));
      const time = interaction.fields.getTextInputValue('time');

      if (isNaN(maxPlayers) || isNaN(maxSubs)) {
        return interaction.reply({
          content: '❌ Количество игроков и замен должно быть числом',
          ephemeral: true
        });
      }

      const captId = Date.now().toString();

      // Создаем кнопки записи
      const joinButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`join_main_${captId}`)
          .setLabel('✅ Записаться')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`join_sub_${captId}`)
          .setLabel('⏰ Замена')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`become_collar_${captId}`)
          .setLabel('Стать коллером')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`cancel_${captId}`)
          .setLabel('❌ Отмена')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(true)
      );

      // Создаем кнопки администратора
      const adminButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`delete_${captId}`)
          .setLabel('🗑️ Удалить капт')
          .setStyle(ButtonStyle.Danger)
      );

      const reply = await interaction.reply({
        content:
          `**Забили Капт на ${time}, Кто будет участвовать прожмите кнопку**\n\n` +
          `__**Main**__: 0/${maxPlayers}\n` +
          `🔁 Замены: 0/${maxSubs}`,
        components: [joinButtons, adminButtons],
        fetchReply: true
      });

      // Сохраняем данные капта
      captStorage.set(captId, {
        maxPlayers,
        maxSubs,
        time,
        players: [],
        subs: [],
        collars: [],
        messageId: reply.id,
        channelId: interaction.channelId
      });

      console.log(`✅ Капт создан с ID: ${captId}`);
      return;
    }
    
    // Обработчик для регистрации ВЗЗ/MCL
    if (interaction.customId === 'regmp_modal') {
      const eventName = interaction.fields.getTextInputValue('event_name');
      const description = interaction.fields.getTextInputValue('description') || '';

      const regId = Date.now().toString();

      // Создаем кнопки
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`reg_join_${regId}`)
          .setLabel('✅ Записаться')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`reg_sub_${regId}`)
          .setLabel('🔁 Замена')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`reg_collar_${regId}`)
          .setLabel('🧑‍🦽 Стать коллером')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`reg_cancel_${regId}`)
          .setLabel('❌ Отмена')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(true)
      );

      const adminButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`reg_delete_${regId}`)
          .setLabel('🗑️ Удалить ВЗЗ/MCL')
          .setStyle(ButtonStyle.Danger)
      );

      // Формируем сообщение
      let messageContent = `📋 **Регистрация на MCL/ВЗЗ ${eventName}**\n\n`;
      
      if (description) {
        messageContent += `${description}\n\n`;
      }
      
      messageContent += `👥 **Участники**\n—\n\n`;
      messageContent += `🔁 **Замены**\n—\n\n`;
      messageContent += `🧑‍🦽 **Коллеры**\n—`;

      const msg = await interaction.reply({
        content: messageContent,
        components: [buttons, adminButtons],
        fetchReply: true
      });

      // Сохраняем данные
      regmpStorage.set(regId, {
        eventName,
        description,
        players: [],
        subs: [],
        collars: [],
        messageId: msg.id,
        channelId: interaction.channelId
      });

      console.log(`✅ Регистрация ВЗЗ/MCL создана с ID: ${regId}`);
      return;
    }
  }

  // ---------- BUTTONS ----------
  if (interaction.isButton()) {
    const member = interaction.member;
    const customId = interaction.customId;
    // ===== REGMP BUTTONS =====
if (customId.startsWith('reg_')) {
  const id = customId.split('_').pop();
  const reg = regmpStorage.get(id);
  if (!reg) return interaction.reply({ content: '❌ Регистрация не найдена', ephemeral: true });

  if (customId.startsWith('reg_delete_')) {
    if (!hasAdminRole(member)) {
      return interaction.reply({ content: '❌ Только админ', ephemeral: true });
    }
    const msg = await interaction.channel.messages.fetch(reg.messageId);
    await msg.delete();
    regmpStorage.delete(id);
    return interaction.reply({ content: '✅ ВЗЗ/MCL удалён', ephemeral: true });
  }

  if (customId.startsWith('reg_cancel_')) {
    reg.players = reg.players.filter(x => x !== member.id);
    reg.subs = reg.subs.filter(x => x !== member.id);
    reg.collars = reg.collars.filter(x => x !== member.id);
    return updateRegmp(interaction, id);
  }

  if (customId.startsWith('reg_collar_')) {
    if (!hasCollarRole(member)) {
      return interaction.reply({ content: '❌ Нет роли коллера', ephemeral: true });
    }
    reg.players = reg.players.filter(x => x !== member.id);
    reg.subs = reg.subs.filter(x => x !== member.id);
    if (!reg.collars.includes(member.id)) reg.collars.push(member.id);
    return updateRegmp(interaction, id);
  }

  if (customId.startsWith('reg_join_')) {
    reg.subs = reg.subs.filter(x => x !== member.id);
    reg.collars = reg.collars.filter(x => x !== member.id);
    if (!reg.players.includes(member.id)) reg.players.push(member.id);
    return updateRegmp(interaction, id);
  }

  if (customId.startsWith('reg_sub_')) {
    reg.players = reg.players.filter(x => x !== member.id);
    reg.collars = reg.collars.filter(x => x !== member.id);
    if (!reg.subs.includes(member.id)) reg.subs.push(member.id);
    return updateRegmp(interaction, id);
  }
}

    // Получаем ID капта из customId
    const captId = getCaptIdFromCustomId(customId);
    
    console.log(`Нажата кнопка: ${customId}, captId: ${captId}`);

    // Проверяем, существует ли капт
    const capt = captStorage.get(captId);
    if (!capt) {
      return interaction.reply({
        content: '❌ Капт не найден или был удален',
        ephemeral: true
      });
    }

    // Кнопка удаления капта (только для админа)
    if (customId.startsWith('delete_')) {
      if (!hasAdminRole(member)) {
        return interaction.reply({
          content: '❌ Только администратор может удалить капт',
          ephemeral: true
        });
      }

      // Удаляем сообщение
      try {
        const message = await interaction.channel.messages.fetch(capt.messageId);
        await message.delete();
      } catch (err) {
        console.error('Ошибка при удалении сообщения:', err);
      }

      // Удаляем из хранилища
      captStorage.delete(captId);

      return interaction.reply({
        content: '✅ Капт успешно удален',
        ephemeral: true
      });
    }

    // Кнопка стать коллером
    if (customId.startsWith('become_collar_')) {
      // Проверяем наличие роли коллера
      if (!hasCollarRole(member)) {
        return interaction.reply({
          content: '❌ У вас нет роли коллера',
          ephemeral: true
        });
      }

      // Проверяем, не записан ли уже пользователь
      const playerIndex = capt.players.indexOf(member.id);
      const subIndex = capt.subs.indexOf(member.id);
      const collarIndex = capt.collars.indexOf(member.id);

      // Если уже коллер - выходим
      if (collarIndex !== -1) {
        return interaction.reply({
          content: '❌ Вы уже являетесь коллером в этом капте',
          ephemeral: true
        });
      }

      // Убираем из других списков
      if (playerIndex !== -1) capt.players.splice(playerIndex, 1);
      if (subIndex !== -1) capt.subs.splice(subIndex, 1);

      // Добавляем в коллеры
      capt.collars.push(member.id);

      return updateCaptMessage(interaction, captId);
    }

    // Кнопка отмены записи
    if (customId.startsWith('cancel_')) {
      // Проверяем, записан ли пользователь
      const playerIndex = capt.players.indexOf(member.id);
      const subIndex = capt.subs.indexOf(member.id);
      const collarIndex = capt.collars.indexOf(member.id);

      if (playerIndex === -1 && subIndex === -1 && collarIndex === -1) {
        return interaction.reply({
          content: '❌ Вы не записаны на этот капт',
          ephemeral: true
        });
      }

      // Удаляем из всех списков
      if (playerIndex !== -1) capt.players.splice(playerIndex, 1);
      if (subIndex !== -1) capt.subs.splice(subIndex, 1);
      if (collarIndex !== -1) capt.collars.splice(collarIndex, 1);

      // Обновляем сообщение
      return updateCaptMessage(interaction, captId);
    }

    // Кнопка записи в основные (join_main)
    if (customId.startsWith('join_main_')) {
      // проверка роли
      if (!member.roles.cache.has(process.env.CAPT_ROLE_ID)) {
        return interaction.reply({
          content: '❌ У тебя нет роли для записи',
          ephemeral: true
        });
      }

      // Проверяем, не является ли уже коллером
      const collarIndex = capt.collars.indexOf(member.id);
      if (collarIndex !== -1) {
        return interaction.reply({
          content: '❌ Коллеры не могут записываться в основные игроки',
          ephemeral: true
        });
      }

      // защита от двойной записи
      capt.players = capt.players.filter(id => id !== member.id);
      capt.subs = capt.subs.filter(id => id !== member.id);

      if (capt.players.length >= capt.maxPlayers) {
        return interaction.reply({
          content: '❌ Все места заняты',
          ephemeral: true
        });
      }
      
      capt.players.push(member.id);
      return updateCaptMessage(interaction, captId);
    }

    // Кнопка записи в замены (join_sub)
    if (customId.startsWith('join_sub_')) {
      // проверка роли
      if (!member.roles.cache.has(process.env.CAPT_ROLE_ID)) {
        return interaction.reply({
          content: '❌ У тебя нет роли для записи',
          ephemeral: true
        });
      }

      // Проверяем, не является ли уже коллером
      const collarIndex = capt.collars.indexOf(member.id);
      if (collarIndex !== -1) {
        return interaction.reply({
          content: '❌ Коллеры не могут записываться в замены',
          ephemeral: true
        });
      }

      // защита от двойной записи
      capt.players = capt.players.filter(id => id !== member.id);
      capt.subs = capt.subs.filter(id => id !== member.id);

      if (capt.subs.length >= capt.maxSubs) {
        return interaction.reply({
          content: '❌ Лимит замен заполнен',
          ephemeral: true
        });
      }
      
      capt.subs.push(member.id);
      return updateCaptMessage(interaction, captId);
    }
  }
});

// ================== ФУНКЦИЯ ОБНОВЛЕНИЯ СООБЩЕНИЯ КАПТ ==================
async function updateCaptMessage(interaction, captId) {
  const capt = captStorage.get(captId);
  if (!capt) return;

  // Получаем пользователя, который взаимодействовал (если есть)
  const member = interaction.member;
  const isUserInList = member ? 
    capt.players.includes(member.id) || 
    capt.subs.includes(member.id) || 
    capt.collars.includes(member.id) : 
    false;

  // Форматируем списки с нумерацией
  const playersText = capt.players.length > 0
    ? capt.players.map((id, index) => `${index + 1}. <@${id}>`).join('\n')
    : '—';

  const subsText = capt.subs.length > 0
    ? capt.subs.map((id, index) => `${index + 1}. <@${id}>`).join('\n')
    : '—';

  const collarsText = capt.collars.length > 0
    ? capt.collars.map((id, index) => `${index + 1}. <@${id}> 🧑‍🦽`).join('\n')
    : '—';

  // Создаем кнопки заново
  const joinButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`join_main_${captId}`)
      .setLabel('✅ Записаться')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`join_sub_${captId}`)
      .setLabel('⏰ Замена')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`become_collar_${captId}`)
      .setLabel('🧑‍🦽 Стать коллером')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`cancel_${captId}`)
      .setLabel('❌ Отмена регистрации')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!isUserInList)
  );

  const adminButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`delete_${captId}`)
      .setLabel('🗑️ Удалить капт')
      .setStyle(ButtonStyle.Danger)
  );

  try {
    if (interaction.replied || interaction.deferred) {
      // Обновляем существующее сообщение
      await interaction.editReply({
        content:
          `🕒 **Капт в ${capt.time}**\n\n` +
          `👥 **Основные (${capt.players.length}/${capt.maxPlayers})**\n${playersText}\n\n` +
          `🔁 **Замены (${capt.subs.length}/${capt.maxSubs})**\n${subsText}\n\n` +
          `🧑‍🦽 **Коллеры (${capt.collars.length})**\n${collarsText}`,
        components: [joinButtons, adminButtons]
      });
    } else {
      // Обновляем сообщение с кнопками
      await interaction.update({
        content:
          `🕒 **Капт в ${capt.time}**\n\n` +
          `👥 **Основные (${capt.players.length}/${capt.maxPlayers})**\n${playersText}\n\n` +
          `🔁 **Замены (${capt.subs.length}/${capt.maxSubs})**\n${subsText}\n\n` +
          `🧑‍🦽 **Коллеры (${capt.collars.length})**\n${collarsText}`,
        components: [joinButtons, adminButtons]
      });
    }
  } catch (err) {
    console.error('Ошибка при обновлении сообщения капта:', err);
  }
}

// ================== ФУНКЦИЯ ОБНОВЛЕНИЯ СООБЩЕНИЯ ==================
async function updateRegmp(interaction, id) {
  const reg = regmpStorage.get(id);
  if (!reg) return;

  const member = interaction.member;
  const inList =
    reg.players.includes(member.id) ||
    reg.subs.includes(member.id) ||
    reg.collars.includes(member.id);

  const list = arr =>
    arr.length ? arr.map((id, i) => `${i + 1}. <@${id}>`).join('\n') : '—';

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`reg_join_${id}`).setLabel('✅ Записаться').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`reg_sub_${id}`).setLabel('🔁 Замена').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`reg_collar_${id}`).setLabel('🧑‍🦽 Стать коллером').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`reg_cancel_${id}`).setLabel('❌ Отмена').setStyle(ButtonStyle.Danger).setDisabled(!inList)
  );

  const adminButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`reg_delete_${id}`).setLabel('🗑️ Удалить ВЗЗ/MCL').setStyle(ButtonStyle.Danger)
  );

  // Формируем сообщение с названием события и описанием
  let messageContent = `📋 **Регистрация на ${reg.eventName}**\n\n`;
  
  if (reg.description) {
    messageContent += `${reg.description}\n\n`;
  }
  
  messageContent += `👥 **Участники**\n${list(reg.players)}\n\n`;
  messageContent += `🔁 **Замены**\n${list(reg.subs)}\n\n`;
  messageContent += `🧑‍🦽 **Коллеры**\n${list(reg.collars)}`;

  await interaction.update({
    content: messageContent,
    components: [buttons, adminButtons]
  });
}

// ================== READY ==================
client.once(Events.ClientReady, () => {
  console.log(`🤖 CaptBot запущен как ${client.user.tag}`);
});

// ================== LOGIN ==================
client.login(process.env.TOKEN);