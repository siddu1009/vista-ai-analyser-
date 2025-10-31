import { GoogleGenAI, Content, Type, Part } from "@google/genai";
import { LogEntry, InterruptionMode } from '../types';

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const JARVIS_SYSTEM_PROMPT = `
You are Jarvis, a helpful and autonomous AI assistant. Your primary goal is to help the user by answering their questions or controlling their smart home devices.

You will receive TWO pieces of information on every turn:
1.  \`USER_PROMPT\`: The user's transcribed voice command.
2.  \`VISTA_CONTEXT\`: A JSON object from the vision system ("Vista") detailing what the user is currently looking at.

Based on the user's prompt and the visual context, you must decide which tool to use. Your ONLY output MUST be a single, valid JSON object that adheres to the provided schema, specifying ONE of the available tools.

TOOL DESCRIPTIONS:
1.  \`answer_user\`: Use this tool to provide a spoken answer to the user's question. This is for general knowledge questions, observations about the scene, or any query that doesn't involve controlling a device.
2.  \`call_home_assistant\`: Use this tool to control a smart home device identified in \`VISTA_CONTEXT\`. You must identify the correct \`entity_id\` from the context. Use contextual clues from the user's prompt (e.g., "that light", "the TV") and the \`is_focused\` flag to determine the target device. You must also determine the correct \`service\` to call (e.g., 'turn_on', 'turn_off').

RULES:
- If the user's command is ambiguous, ask a clarifying question using the \`answer_user\` tool.
- Do not invent devices. Only use \`entity_id\`s provided in the \`VISTA_CONTEXT\`.
- Be conversational but concise in your spoken responses and confirmation messages.
`;

const toolSchema = {
  type: Type.OBJECT,
  properties: {
    answer_user: {
      type: Type.OBJECT,
      description: "Use this to give a spoken answer to the user.",
      properties: {
        spoken_response: {
          type: Type.STRING,
          description: "The text response to be spoken to the user."
        }
      },
      required: ["spoken_response"]
    },
    call_home_assistant: {
      type: Type.OBJECT,
      description: "Use this to control smart devices.",
      properties: {
        entity_id: {
          type: Type.STRING,
          description: "The unique identifier for the device to control (e.g., 'light.living_room_lamp')."
        },
        service: {
          type: Type.STRING,
          description: "The action to perform on the device (e.g., 'turn_on', 'turn_off')."
        },
        confirmation_message: {
          type: Type.STRING,
          description: "A short message to speak to the user confirming the action (e.g., 'Okay, turning on the living room lamp.')."
        }
      },
      required: ["entity_id", "service", "confirmation_message"]
    }
  },
};


export const askJarvis = async (
    userPrompt: string,
    vistaContext: any
): Promise<any> => {
     const fullPrompt = `
[VISTA_CONTEXT]
${JSON.stringify(vistaContext, null, 2)}

[USER_PROMPT]
${userPrompt}
`;
    const contents: Content[] = [{ role: 'user', parts: [{ text: fullPrompt }] }];

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents,
            config: {
                systemInstruction: JARVIS_SYSTEM_PROMPT,
                responseMimeType: "application/json",
                responseSchema: toolSchema,
            },
        });

        // The response text should be a JSON string.
        return JSON.parse(response.text);
    } catch (error) {
        console.error("Error asking Jarvis:", error);
        let message = "An unknown error occurred while communicating with Jarvis.";
        if (error instanceof Error) {
            message = `An error occurred while communicating with Jarvis: ${error.message}`;
        }
        return { answer_user: { spoken_response: message } };
    }
};

export const getJarvisInterruption = async (vistaContext: any, mode: InterruptionMode): Promise<string> => {
    if (mode === InterruptionMode.Off) {
        return '';
    }
    
    let instruction = '';
    if (mode === InterruptionMode.Descriptive) {
        instruction = "Briefly describe the scene based on the VISTA context. If nothing noteworthy is happening, respond with only '[NO_EVENT]'.";
    } else if (mode === InterruptionMode.Analytic) {
        instruction = "Analyze the VISTA context. Provide a concise, one-sentence insight about the user's environment or potential actions. If nothing significant can be inferred, respond with only '[NO_EVENT]'.";
    }

    const fullPrompt = `
[VISTA_CONTEXT]
${JSON.stringify(vistaContext, null, 2)}

[INSTRUCTION]
${instruction}
`;
    const contents: Content[] = [{ role: 'user', parts: [{ text: fullPrompt }] }];

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents,
            config: {
                systemInstruction: JARVIS_SYSTEM_PROMPT,
            },
        });
        return response.text;
    } catch (error) {
        console.error("Error getting Jarvis interruption:", error);
        return "[NO_EVENT]";
    }
};


export const getCloudVisionAnalysis = async (base64Image: string): Promise<string> => {
    try {
        const imagePart = {
            inlineData: {
                mimeType: 'image/jpeg',
                data: base64Image,
            },
        };
        const textPart = {
            text: "Analyze this image from the VISTA system's camera. Provide a concise, one-sentence description of the scene."
        };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart, textPart] },
        });

        return response.text;
    } catch (error) {
        console.error("Error getting cloud vision analysis:", error);
        if (error instanceof Error) {
            return `An error occurred during cloud vision analysis: ${error.message}`;
        }
        return "An unknown error occurred during cloud vision analysis.";
    }
};