import cors from 'cors'
import express from 'express'

const app = express()
const port = Number(process.env.PORT ?? 3001)

app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }))
app.use(express.json())

app.post('/api/realtime-token', async (_request, response) => {
	const apiKey = process.env.OPENAI_API_KEY

	if (!apiKey) {
		response.json({
			mock: true,
			client_secret: {
				value: 'mock-openai-realtime-token',
				expires_at: Math.floor(Date.now() / 1000) + 60,
			},
		})
		return
	}

	const realtimeResponse = await fetch('https://api.openai.com/v1/realtime/sessions', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			model: process.env.OPENAI_REALTIME_MODEL ?? 'gpt-realtime',
			voice: process.env.OPENAI_REALTIME_VOICE ?? 'alloy',
		}),
	})

	if (!realtimeResponse.ok) {
		const details = await realtimeResponse.text()
		response.status(realtimeResponse.status).json({
			error: 'Failed to create OpenAI realtime session',
			details,
		})
		return
	}

	response.status(200).json(await realtimeResponse.json())
})

app.listen(port, () => {
	console.log(`VoiceBoard token proxy listening on http://localhost:${port}`)
})
