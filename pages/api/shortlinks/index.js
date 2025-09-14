import dbConnect from "@/lib/mongoose";
import shortLink from "@/models/shortlink";

function generateRandomId(length) {
  const characters = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}
export default async function handler(req, res) {
  const {
    method
  } = req;
  await dbConnect();
  switch (method) {
    case "GET":
      try {
        const links = await shortLink.find({}).sort({
          createdAt: -1
        });
        res.status(200).json({
          success: true,
          data: links
        });
      } catch (error) {
        res.status(400).json({
          success: false,
          message: error.message
        });
      }
      break;
    case "POST":
      try {
        let {
          url,
          name
        } = req.body;
        if (!url) {
          return res.status(400).json({
            success: false,
            message: "URL tidak boleh kosong."
          });
        }
        if (!name) {
          name = generateRandomId(6);
        }
        const existingLink = await shortLink.findOne({
          id: name
        });
        if (existingLink) {
          return res.status(409).json({
            success: false,
            message: "Short ID ini sudah digunakan."
          });
        }
        const newLink = await shortLink.create({
          id: name,
          url: url
        });
        res.status(201).json({
          success: true,
          data: newLink
        });
      } catch (error) {
        res.status(400).json({
          success: false,
          message: error.message
        });
      }
      break;
    default:
      res.setHeader("Allow", ["GET", "POST"]);
      res.status(405).end(`Method ${method} Not Allowed`);
      break;
  }
}