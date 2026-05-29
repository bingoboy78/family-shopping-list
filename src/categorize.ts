export interface CategorizeItemInput {
  id: string
  name: string
}

export async function categorizeItems(
  items: CategorizeItemInput[],
  categories: string[]
): Promise<Record<string, string>> {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error('OpenRouter API key is not configured. Please add VITE_OPENROUTER_API_KEY to your .env file.')
  }

  // Filter categories to make sure we don't map to 'Uncategorized'
  const validCategories = categories.filter(c => c !== 'Uncategorized')

  const systemPrompt = `You are a helper that categorizes shopping list items.
You must categorize each item into one of the following exact categories:
${validCategories.map(c => `- ${c}`).join('\n')}

The items can be in English, Russian, or Hebrew.
You must respond ONLY with a valid JSON object mapping the item's unique ID to the name of the category you selected.
Example output format:
{
  "item_id_1": "Category Name",
  "item_id_2": "Another Category Name"
}`

  const userPrompt = `Categorize the following items:
${JSON.stringify(items.map(item => ({ id: item.id, name: item.name })), null, 2)}`

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': window.location.origin, // Required by OpenRouter
        'X-Title': 'Family Shopping App', // Optional, for OpenRouter analytics
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-3.1-8b-instruct:free',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' }
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error?.message || `HTTP error! Status: ${response.status}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) {
      throw new Error('Empty response from AI model.')
    }

    const result = JSON.parse(content) as Record<string, string>
    return result
  } catch (error) {
    console.error('AI Categorization error:', error)
    throw error
  }
}
