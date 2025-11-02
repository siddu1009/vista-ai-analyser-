require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI, FunctionDeclaration } = require('@google/generative-ai');
const { JARVIS_SYSTEM_PROMPT } = require('./constants');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase limit for image data

// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../dist')));

// Gemini API Key from environment variables
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.warn('GEMINI_API_KEY is not set. Please set it in your environment variables.');
}
const genAI = new GoogleGenerativeAI(API_KEY);

// Function Declarations for Jarvis
const answerUserFunction = {
  name: 'answer_user',
  parameters: {
    type: 'object',
    description: 'Provide a spoken response to the user for direct questions, comments, or observations.',
    properties: {
      spoken_response: {
        type: 'string',
        description: 'The concise and witty response to be spoken out loud to the user.',
      },
    },
    required: ['spoken_response'],
  },
};

const callHomeAssistantFunction = {
  name: 'call_home_assistant',
  parameters: {
    type: 'object',
    description: 'Control a smart home device.',
    properties: {
      entity_id: {
        type: 'string',
        description: 'The unique ID of the device to control (e.g., "light.desk_lamp").',
      },
      service: {
        type: 'string',
        description: 'The service to call, either "turn_on" or "turn_off".',
        enum: ['turn_on', 'turn_off'],
      },
      confirmation_message: {
        type: 'string',
        description: 'A brief confirmation message to be spoken to the user after the action is taken.'
      }
    },
    required: ['entity_id', 'service', 'confirmation_message'],
  },
};

const recognizeSongFunction = {
  name: 'recognize_song',
  parameters: {
    type: 'object',
    description: 'Identifies a song playing in the environment.',
    properties: {},
  },
};

// API endpoint for Gemini chat
app.post('/api/chat', async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(500).json({ error: 'Gemini API key is not configured.' });
    }

    const { message, context } = req.body;
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const chat = model.startChat({
      history: [], // History will be managed by the frontend for now
      generationConfig: {
        temperature: 0.9,
        topK: 1,
        topP: 1,
        maxOutputTokens: 2048,
      },
      tools: [{ functionDeclarations: [answerUserFunction, callHomeAssistantFunction, recognizeSongFunction] }],
      systemInstruction: JARVIS_SYSTEM_PROMPT,
    });

    const fullPrompt = `
      User Prompt: "${message}"

      Current Context:
      ${JSON.stringify(context, null, 2)}
    `;

    const result = await chat.sendMessage(fullPrompt);
    const response = await result.response;

    if (response.functionCall) {
      res.json({ functionCalls: [response.functionCall] });
    } else {
      res.json({ text: response.text() });
    }

  } catch (error) {
    console.error('Error in Gemini chat API:', error);
    res.status(500).json({ error: 'Failed to communicate with Gemini API.' });
  }
});

// API endpoint for Cloud Vision Analysis (using Gemini Pro Vision)
app.post('/api/vision', async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(500).json({ error: 'Gemini API key is not configured.' });
    }

    const { imageData } = req.body;
    if (!imageData) {
      return res.status(400).json({ error: 'No image data provided.' });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });
    const prompt = "Analyze this image and provide a concise description of the scene, identifying key objects and any visible text. Return the response as a JSON object with 'scene_description' (string) and 'visible_text' (array of strings).";

    const image = {
      inlineData: {
        data: imageData.split(',')[1], // Remove "data:image/jpeg;base64," prefix
        mimeType: imageData.split(',')[0].split(':')[1].split(';')[0],
      },
    };

    const result = await model.generateContent([prompt, image]);
    const response = await result.response;
    const text = response.text();

    // Attempt to parse the response as JSON
    try {
      const parsedResponse = JSON.parse(text);
      res.json(parsedResponse);
    } catch (jsonError) {
      console.warn('Gemini Vision API response was not valid JSON:', text);
      // If not valid JSON, return the raw text in a structured way
      res.json({ scene_description: text, visible_text: [] });
    }

  } catch (error) {
    console.error('Error in Gemini Vision API:', error);
    res.status(500).json({ error: 'Failed to communicate with Gemini Vision API.' });
  }
});


// All other GET requests not handled before will return the React app
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../dist', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});