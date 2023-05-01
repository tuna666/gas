const CHANNEL_ACCESS_TOKEN = 'YOURTOKEN';
const GPT_API_KEY = 'YOURKEY';
const SPREADSHEET_ID = 'YOURID';
const MODEL = "gpt-3.5-turbo";

function getHistorySheet() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName('History');
  return sheet;
}

function getPromptSheet() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName('Prompts');
  return sheet;
}

function doPost(e) {
  try {
    const json = JSON.parse(e.postData.contents);
    const events = json.events;
    events.forEach(function (event) {
      switch (event.type) {
        case 'message':
          handleMessageEvent(event);
          break;
        case 'postback':
          handlePostbackEvent(event);
          break;
      }
    });
  } catch (error) {
    console.error('エラーが発生しました: ', error);
  }

  return ContentService.createTextOutput(JSON.stringify({ content: 'success' })).setMimeType(ContentService.MimeType.JSON);
}

function handleMessageEvent(event) {
  const userId = event.source.userId;
  const userMessage = event.message.text;
  const replyToken = event.replyToken;
  // const userId = 'Ua91b05cac5dd461d9b7d2905ad843c46'
  // const userMessage = '#promptKoreanMom'
  // const replyToken = 111

  if (userMessage.startsWith('#prompt')) {
    handlePromptSelection(userMessage, userId);
    replyMessage(replyToken, 'プロンプトをセットしました。会話を続けてください。');
  } else if (userMessage === '#reset context') {
    saveResetDate(userId);
    replyMessage(replyToken, '過去の会話をリセットしました。新しい会話を始めてください。');
  } else if (userMessage === '#clear') {
    clearSheetContentsExceptHeader();
    replyMessage(replyToken, 'スプシをクリアしました');
  } else {
    const chatGptResponse = chatWithGpt(userMessage, userId);
    replyMessage(replyToken, chatGptResponse);
  }
}

function handlePromptSelection(userMessage, userId) {
  const promptId = userMessage.substring(1); // #を除いたプロンプトIDを取得
  const promptText = getPromptText(promptId);
  if (promptText) {
    savePrompt(userId, promptText);
  }
}

function getPromptText(promptId) {
  const sheet = getPromptSheet();
  const numRows = sheet.getLastRow();
  const searchRange = sheet.getRange(1, 1, numRows, 2);
  const values = searchRange.getValues();

  for (let i = 0; i < values.length; i++) {
    if (values[i][0] === promptId) {
      return values[i][1];
    }
  }

  return null;
}

function getSavedPrompt(userId) {
  const sheet = getHistorySheet()
  const numRows = sheet.getLastRow();
  const searchRange = sheet.getRange(1, 1, numRows, 5);
  const values = searchRange.getValues();
  let latestPrompt = null;

  for (let i = 0; i < values.length; i++) {
    if (values[i][0] === userId && values[i][4] === "prompt") {
      latestPrompt = values[i][1];
    }
  }

  if (latestPrompt) {
    return latestPrompt;
  }

  return 'あなたは助けになるアシスタントです。';
}

function savePrompt(userId, prompt) {
  const sheet = getHistorySheet()
  const currentDate = new Date();
  sheet.appendRow([userId, prompt, "", "", "prompt", currentDate]);
}

function saveResetDate(userId) {
  const sheet = getHistorySheet()
  const currentDate = new Date();
  sheet.appendRow([userId, "", "", "", "reset_date", currentDate]);
}

function getResetDate(userId) {
  const sheet = getHistorySheet()
  const numRows = sheet.getLastRow();
  const searchRange = sheet.getRange(1, 1, numRows, 6);
  const values = searchRange.getValues();
  let latestResetDate = null;

  // 最新のリセット日付を取得
  for (let i = 0; i < values.length; i++) {
    if (values[i][0] === userId && values[i][4] === "reset_date") {
      latestResetDate = values[i][5];
    }
  }

  if (latestResetDate) {
    return new Date(latestResetDate);
  }

  return null;
}

function chatWithGpt(userMessage, userId) {
  const prompt = getSavedPrompt(userId);
  const resetDate = getResetDate(userId);

  const url = 'https://api.openai.com/v1/chat/completions';
  const headers = {
    'Content-Type': 'application/json; charset=UTF-8',
    'Authorization': 'Bearer ' + GPT_API_KEY,
  };

  const messages = [
    {
      'role': 'system',
      'content': prompt
    },
  ];

  const userSheet = getHistorySheet()
  const numRows = userSheet.getLastRow();
  const searchRange = userSheet.getRange(1, 1, numRows, 6);
  const values = searchRange.getValues();

  for (let i = 0; i < values.length; i++) {
    if (values[i][0] === userId && (!resetDate || new Date(values[i][5]) >= resetDate)) {
      messages.push({
        'role': 'user',
        'content': values[i][2],
      }, {
        'role': 'assistant',
        'content': values[i][3],
      });
    }
  }

  messages.push({
    'role': 'user',
    'content': userMessage,
  });

  const payload = {
    'model': 'gpt-3.5-turbo',
    'messages': messages.slice(-1000), // 最新の1000トークンまで取得
    'max_tokens': 1000,
    'n': 1,
    'stop': null,
    'temperature': 0.7,
  };

  const options = {
    'method': 'post',
    'headers': headers,
    'payload': JSON.stringify(payload),
  };

  const response = UrlFetchApp.fetch(url, options);
  const json = JSON.parse(response.getContentText());
  console.log('OpenAI APIレスポンス:', json);
  const assistantMessage = json.choices[0].message.content;

  saveUserAndAssistantMessages(userId, userMessage, assistantMessage);

  return assistantMessage;
}

function saveUserAndAssistantMessages(userId, userMessage, assistantMessage) {
  const currentDate = new Date();
  const sheet = getHistorySheet()
  sheet.appendRow([userId, "", userMessage, assistantMessage, "", currentDate]);
}


function replyMessage(replyToken, message) {
  const url = 'https://api.line.me/v2/bot/message/reply';
  const headers = {
    'Content-Type': 'application/json; charset=UTF-8',
    'Authorization': 'Bearer ' + CHANNEL_ACCESS_TOKEN,
  };

  const payload = {
    'replyToken': replyToken,
    'messages': [{
      'type': 'text',
      'text': message
    }]
  };

  const options = {
    'method': 'post',
    'headers': headers,
    'payload': JSON.stringify(payload),
  };

  UrlFetchApp.fetch(url, options);
}

function clearSheetContentsExceptHeader() {
  const sheet = getHistorySheet()
  const numRows = sheet.getLastRow();
  const numColumns = sheet.getLastColumn();

  if (numRows > 1) {
    const rangeToClear = sheet.getRange(2, 1, numRows - 1, numColumns);
    rangeToClear.clearContent();
  }
}

