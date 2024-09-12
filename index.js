import webSocket from "ws"
import dotenv from "dotenv"
import mic from "mic"
import { exit } from "node:process"
import translate from "translate"
import readline from 'node:readline';


dotenv.config()

const gladiaKey = process.env.GLADIA_API_KEY
const gladiaUrl = "wss://api.gladia.io/audio/text/audio-transcription"
const SAMPLE_RATE = 16000
translate.engine = "deepl";
translate.key = process.env.DEEPL_KEY;

if (!gladiaKey) {
  console.error("You must provide a gladia key. Go to app.gladia.io")
  exit(1)
} else {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  function askForLanguages() {
    return new Promise((resolve) => {
      rl.question(`Choose the language you want to translate to (en, fr, de): `, (toLanguage) => {
        console.log(`You chose to translate to ${toLanguage}`);
        if (toLanguage !== "en" && toLanguage !== "fr" && toLanguage !== "de") {
          console.log("Invalid language. Please choose between en, fr, de");
          rl.close();
          return;
        }

        rl.question(`Choose the language you are speaking (en, fr, de): `, (fromLanguage) => {
          console.log(`You chose to translate from ${fromLanguage}`);
          if (fromLanguage !== "en" && fromLanguage !== "fr" && fromLanguage !== "de") {
            console.log("Invalid language. Please choose between en, fr, de");
            rl.close();
            return;
          }
          translate.from = fromLanguage;
          translate.to = toLanguage;

          rl.close();
          resolve();
        });
      });
    });
  }

  askForLanguages().then(() => {
    const ws = new webSocket(gladiaUrl)

    ws.on("open", () => {
      const configuration = {
        x_gladia_key: gladiaKey,
        language_behaviour: "automatic single language",
        sample_rate: SAMPLE_RATE,
        encoding: "WAV",
      }
      ws.send(JSON.stringify(configuration))
      const microphone = mic({
        rate: SAMPLE_RATE,
        device: 'plughw:0,6',
        channels: "1",
      })
      const microphoneInputStream = microphone.getAudioStream()
      microphoneInputStream.on("data", function (data) {
        const base64 = data.toString("base64")
        if (ws.readyState === webSocket.OPEN) {
          ws.send(JSON.stringify({ frames: base64 }))
        } else {
          console.log("WebSocket ready state is not [OPEN]")
        }
      })
      microphoneInputStream.on("error", function (err) {
        console.log("Error in Input Stream: " + err)
      })
      microphone.start()
    })
    var lastTranscript = ""
    ws.on("message", async (event) => {
      const utterance = JSON.parse(event.toString())
      if (utterance.event === "connected") {
        console.log(`\n* Connection id: ${utterance.request_id} *\n`)
      } else if (utterance.event === "transcript") {

        if (utterance.transcription != undefined) {
          lastTranscript = utterance.transcription
        }

        if (utterance.transcription === undefined && lastTranscript != "") {
          const saveTranscript = lastTranscript
          lastTranscript = ""
          console.log(saveTranscript)
          const translation = await translate(saveTranscript)
          console.log(translation)
        }

      }
    })

    ws.on("error", (error) => {
      console.log("An error occurred:", error.message)
    })

    ws.on("close", () => {
      console.log("Connection closed")
    })
  })
}
