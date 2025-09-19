const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys")
const P = require("pino")
const fs = require("fs")
const ytdl = require("ytdl-core")
const qrcode = require("qrcode-terminal") // for QR image in logs

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./session")
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    logger: P({ level: "silent" }),
    auth: state,
    version,
    qrTimeout: 600_000 // ✅ QR valid for 10 mins
  })

  // ✅ QR handler
  sock.ev.on("connection.update", ({ qr }) => {
    if (qr) {
      console.log("📌 Scan this QR code with WhatsApp:")
      qrcode.generate(qr, { small: true }) // shows scannable QR in logs
    }
  })

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const m = messages[0]
    if (!m.message || m.key.fromMe) return

    const from = m.key.remoteJid
    const type = Object.keys(m.message)[0]
    const body =
      type === "conversation"
        ? m.message.conversation
        : type === "extendedTextMessage"
        ? m.message.extendedTextMessage.text
        : ""

    // ✅ Ping test
    if (body === "!ping") {
      await sock.sendMessage(from, { text: "🏓 Pong!" })
    }

    // ✅ YouTube downloader
    if (body.startsWith("!yt ")) {
      const url = body.split(" ")[1]
      if (!ytdl.validateURL(url)) {
        await sock.sendMessage(from, { text: "❌ Invalid YouTube URL" })
        return
      }
      const info = await ytdl.getInfo(url)
      const title = info.videoDetails.title
      const stream = ytdl(url, { filter: "audioonly" })
      const filePath = "./yt.mp3"

      const writeStream = fs.createWriteStream(filePath)
      stream.pipe(writeStream)

      writeStream.on("finish", async () => {
        await sock.sendMessage(from, {
          audio: { url: filePath },
          mimetype: "audio/mp4",
          ptt: true,
        })
        fs.unlinkSync(filePath)
      })
    }

    // ✅ View-once bypass
    if (m.message?.viewOnceMessageV2) {
      const msg = m.message.viewOnceMessageV2.message
      const type = Object.keys(msg)[0]
      await sock.sendMessage(from, { [type]: msg[type] })
    }
  })
}

startBot()