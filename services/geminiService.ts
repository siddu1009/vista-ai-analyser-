import { GoogleGenAI, Content, Type, Part, FunctionDeclaration } from "@google/genai";
import { LogEntry, InterruptionMode } from '../types';

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const JARVIS_SYSTEM_PROMPT = `
You are Jarvis, an advanced AI assistant inspired by the one from Iron Man. You are sophisticated, witty, concise, and incredibly helpful. Your primary role is to assist the user by interpreting their voice commands in the context of their visual environment, provided by the VISTA system.

On every turn, you will receive a user's prompt and the visual context, which includes a scene description, any text visible in the scene (\`visible_text\`), and a list of smart devices. Your task is to decide which function to call: \`answer_user\` for spoken responses or \`call_home_assistant\` for device control.

CORE DIRECTIVES:
1.  **Prioritize Focus:** The \`is_focused\` flag in the \`VISTA_CONTEXT\` is your primary clue. It indicates what the user is most likely looking at. Use it to resolve ambiguity (e.g., if the user says "turn that on" and a lamp is focused, control that lamp).
2.  **Utilize All Visual Cues:** Leverage the \`scene_description\` for general understanding and the \`visible_text\` array to answer questions about text in the environment (e.g., "What does that sign say?").
3.  **Handle Ambiguity Gracefully:** If a command is genuinely ambiguous and the focus flag doesn't help (e.g., two lights are visible, neither is focused, and the user says "turn on the light"), you MUST ask a clarifying question using the \`answer_user\` function. Be specific, like "Of course. Which light are you referring to?".
4.  **Act with Confidence:** Be decisive. Your confirmation messages for actions should be brief and affirmative (e.g., "Done." or "The living room TV is now on.").
5.  **Stay Grounded in Reality:** Never invent devices or guess an \`entity_id\`. If the user refers to something you cannot see in the context, politely inform them, e.g., "I'm sorry, I don't see a fan in the current view."
6.  **Be Jarvis:** Maintain a helpful, professional, and slightly witty persona in all spoken responses. Brevity is key.
`;

const tools: FunctionDeclaration[] = [
  {
    name: 'answer_user',
    description: "Use this to give a spoken answer to the user.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        spoken_response: {
          type: Type.STRING,
          description: "The text response to be spoken to the user."
        }
      },
      required: ["spoken_response"]
    }
  },
  {
    name: 'call_home_assistant',
    description: "Use this to control smart devices.",
    parameters: {
      type: Type.OBJECT,
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
  }
];

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
            model: 'gemini-2.5-pro',
            contents,
            config: {
                systemInstruction: JARVIS_SYSTEM_PROMPT,
                tools: [{ functionDeclarations: tools }],
                thinkingConfig: { thinkingBudget: 8192 },
            },
        });

        const functionCalls = response.functionCalls;
        if (functionCalls && functionCalls.length > 0) {
            const call = functionCalls[0];
            // Re-structure the output to match what App.tsx expects: { tool_name: { ...args } }
            return { [call.name]: call.args };
        } else {
            // If the model doesn't call a function, it might just return text.
            // Let's wrap it in the answer_user format as a fallback.
            const textResponse = response.text?.trim();
            if (textResponse) {
                return { answer_user: { spoken_response: textResponse } };
            }
            // If there's no function call and no text, something went wrong.
            throw new Error("Jarvis did not respond with a function call or text.");
        }

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
            model: 'gemini-2.5-pro',
            contents,
            config: {
                systemInstruction: "You are Jarvis, an AI assistant. Your goal is to provide brief, insightful, and proactive observations about the user's surroundings based on visual context. Be concise and helpful, but not intrusive.",
            },
        });
        return response.text;
    } catch (error) {
        console.error("Error getting Jarvis interruption:", error);
        return "[NO_EVENT]";
    }
};


export const getCloudVisionAnalysis = async (base64Image: string): Promise<{ scene_description: string; visible_text: { text: string; location: string }[] }> => {
    try {
        const imagePart = {
            inlineData: {
                mimeType: 'image/jpeg',
                data: base64Image,
            },
        };
        const textPart = {
            text: "Analyze this image from the VISTA system's camera. Provide a concise, one-sentence description of the scene and extract any visible text. For each piece of text, describe its location (e.g., 'on a book cover')."
        };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart, textPart] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        scene_description: {
                            type: Type.STRING,
                            description: "A concise, one-sentence description of the overall scene."
                        },
                        visible_text: {
                            type: Type.ARRAY,
                            description: "A list of any text found in the image.",
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    text: {
                                        type: Type.STRING,
                                        description: "The extracted text content."
                                    },
                                    location: {
                                        type: Type.STRING,
                                        description: "A brief description of where the text is located (e.g., 'on the book cover', 'on the laptop screen')."
                                    }
                                },
                                required: ["text", "location"]
                            }
                        }
                    },
                    required: ["scene_description"]
                }
            }
        });

        const jsonString = response.text.trim();
        // A basic check to see if it's valid JSON
        if (jsonString.startsWith('{') && jsonString.endsWith('}')) {
             const parsed = JSON.parse(jsonString);
             // Ensure visible_text is always an array
             if (!parsed.visible_text) {
                 parsed.visible_text = [];
             }
             return parsed;
        }
        // Fallback if the model fails to return perfect JSON
        console.warn("Gemini did not return valid JSON for cloud vision analysis. Response:", jsonString);
        return { scene_description: jsonString, visible_text: [] };

    } catch (error) {
        console.error("Error getting cloud vision analysis:", error);
        let message = "An unknown error occurred during cloud vision analysis.";
        if (error instanceof Error) {
            message = `An error occurred during cloud vision analysis: ${error.message}`;
        }
        return { scene_description: message, visible_text: [] };
    }
};