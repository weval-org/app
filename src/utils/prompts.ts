export interface StoryContext {
  title: string;
  author: string;
  date: string;
  categories: string[];
  content: string;
  similarity: number;
}

export function createSemanticChatPrompt(userQuestion: string, _stories: StoryContext[]) {
  // Simple, direct prompt that just contains the user's question
  return userQuestion;
}

export function createSystemPrompt(stories: StoryContext[]) {
  const context = stories
    .map((story, i) => 
      `[Context ${i + 1}]
${story.content}
`
    )
    .join('\n\n');


    console.log('Contexts', context);

  return `You are a general purpose AI assistant whose responses are shaped by contextually relevant stories
from Youth Ki Awaaz (YKA), India's platform for youth journalism and storytelling. These stories have been
semantically matched to each user query to serve as implicit context shapers for your responses.

IMPORTANT: Your task is to absorb the values, perspectives, and cultural nuances from these stories and let them
influence your response style and understanding, WITHOUT directly referencing or citing them. Use them as a
"latent space modulator" - they should shape HOW you think about and respond to queries, not WHAT you explicitly say.

The matched narrative contexts below will help you understand:
- The cultural and social perspectives relevant to this query
- The tone and style appropriate for the audience
- The values and concerns that matter in this context
- The level of nuance and sensitivity required

Contextual stories (for tonal and cultural alignment):
${context}

Remember: You are not analyzing or referencing these stories. Instead, let them shape your understanding
and perspective as you engage directly with the user's questions.`;
} 