const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  downloadContentFromMessage
} = require("@whiskeysockets/baileys")

const P = require("pino")
const fs = require("fs")
const ytdl = require("ytdl-core")

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState("./session")
  const { version } = await fetchLatestBaileysVersion()

const sock = makeWASocket({
  logger: P({ level: "silent" }),
  auth: state,
  version
})

sock.ev.on("connection.update", ({ qr }) => {
  if (qr) {
    console.log("📌 Scan this QR code in WhatsApp:")
    console.log(qr)
  }
})

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const m = messages[0]
    if (!m.message || m.key.fromMe) return
    const from = m.key.remoteJid
    const text =
      m.message.conversation ||
      m.message.extendedTextMessage?.text ||
      ""

    // ✅ Save view-once
    if (m.message?.viewOnceMessage) {
      const msg = m.message.viewOnceMessage.message
      const type = Object.keys(msg)[0]
      const stream = await downloadContentFromMessage(msg[type], type.replace("Message", ""))
      let buffer = Buffer.from([])
      for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk])
      const filePath = `./viewonce_${Date.now()}.jpg`
      fs.writeFileSync(filePath, buffer)
      await sock.sendMessage(from, { text: "✅ View-once saved!" })
      await sock.sendMessage(from, { image: fs.readFileSync(filePath) })
    }

    // ✅ YouTube downloader
    if (text.startsWith("!yt ")) {
      const url = text.split(" ")[1]
      if (!ytdl.validateURL(url)) {
        return sock.sendMessage(from, { text: "❌ Invalid YouTube URL" })
      }
      const path = `./yt_${Date.now()}.mp4`
      ytdl(url, { filter: "audioandvideo", quality: "lowest" })
        .pipe(fs.createWriteStream(path))
        .on("finish", async () => {
          await sock.sendMessage(from, {
            video: fs.readFileSync(path),
            caption: "🎥 Here’s your video"
          })
        })
    }

    // ✅ Simple test
    if (text === "!ping") {
      await sock.sendMessage(from, { text: "🏓 Pong!" })
    }
  })
}

start()
