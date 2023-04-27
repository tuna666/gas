const CHANNEL_ACCESS_TOKEN = 'YOURTOKEN';
const GPT_API_KEY = 'YOURKEY';
const SPREADSHEET_ID = 'YOURID';
const MODEL = "gpt-3.5-turbo";

// スプレッドシートを取得する関数
function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function doPost(e) {
  try {
    const json = JSON.parse(e.postData.contents);
    const events = json.events;

    events.forEach(function (event) {
      const userId = event.source.userId; // ユーザーIDを取得
      switch (event.type) {
        case 'message':
          handleMessageEvent(event, userId);
          break;
        case 'postback':
          handlePostbackEvent(event, userId);
          break;
      }
    });
  } catch (error) {
    console.error('エラーが発生しました: ', error);
  }

  return ContentService.createTextOutput(JSON.stringify({ content: 'success' })).setMimeType(ContentService.MimeType.JSON);
}


function handleMessageEvent(event, userId) {
  const userMessage = event.message.text;
  const replyToken = event.replyToken;

  const chatGptResponse = chatWithGpt(userMessage, userId);
  replyMessage(replyToken, chatGptResponse);
}


function chatWithGpt(userMessage, userId) {
  const previousMessages = getPreviousMessages(userId);

  if (!userMessage || (typeof userMessage === 'string' && userMessage.trim() === '')) {
    return 'メッセージが空です。';
  }

  const url = 'https://api.openai.com/v1/chat/completions';
  const headers = {
    'Content-Type': 'application/json; charset=UTF-8',
    'Authorization': 'Bearer ' + GPT_API_KEY,
  };

  const messages = [
    {
      'role': 'system',
      'content': 'You are a helpful assistant.'
    },
    ...previousMessages,
    {
      'role': 'user',
      'content': userMessage
    }
  ];

  const payload = {
    'model': 'gpt-3.5-turbo',
    'messages': messages,
    'max_tokens': 1024,
    'n': 1,
    'stop': null,
    'temperature': 0.8,
  };

  const options = {
    'method': 'post',
    'headers': headers,
    'payload': JSON.stringify(payload),
  };

  const response = UrlFetchApp.fetch(url, options);
  const jsonResponse = JSON.parse(response.getContentText());
  const chatGptResponse = jsonResponse.choices[0].message.content;

  saveMessageToSpreadsheet(userId, userMessage, chatGptResponse);
  return chatGptResponse;
}

function getPreviousMessages(userId) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getActiveSheet();
  const data = sheet.getDataRange().getValues();
  const previousMessages = [];

  for (const row of data) {
    if (row[0] === userId) {
      previousMessages.push({
        'role': 'user',
        'content': row[1]
      });
      previousMessages.push({
        'role': 'assistant',
        'content': row[2]
      });
    }
  }

  return previousMessages;
}

function saveMessageToSpreadsheet(userId, userMessage, assistantMessage) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getActiveSheet();
  sheet.appendRow([userId, userMessage, assistantMessage]);
}

function replyMessage(replyToken, chatGptResponse) {
  const url = 'https://api.line.me/v2/bot/message/reply';
  const headers = {
    'Content-Type': 'application/json; charset=UTF-8',
    'Authorization': 'Bearer ' + CHANNEL_ACCESS_TOKEN,
  };
  const payload = {
    'replyToken': replyToken,
    'messages': [
      {
        'type': 'text',
        'text': chatGptResponse,
      },
    ],
  };

  const options = {
    'method': 'post',
    'headers': headers,
    'payload': JSON.stringify(payload),
  };

  UrlFetchApp.fetch(url, options);
}