import dbConnect from "@/lib/mongoose";
import shortLink from "@/models/shortlink";
export default async function handler(req, res) {
  const {
    method
  } = req;
  const {
    id
  } = req.query;
  await dbConnect();
  switch (method) {
    case "GET":
      try {
        const link = await shortLink.findOne({
          id: id
        });
        if (!link) {
          return res.status(404).json({
            success: false,
            message: "Link tidak ditemukan."
          });
        }
        res.status(200).json({
          success: true,
          data: link
        });
      } catch (error) {
        res.status(400).json({
          success: false,
          message: error.message
        });
      }
      break;
    case "PUT":
      try {
        const {
          url
        } = req.body;
        if (!url) {
          return res.status(400).json({
            success: false,
            message: "URL tidak boleh kosong."
          });
        }
        const link = await shortLink.findOneAndUpdate({
          id: id
        }, {
          url: url
        }, {
          new: true,
          runValidators: true
        });
        if (!link) {
          return res.status(404).json({
            success: false,
            message: "Link tidak ditemukan."
          });
        }
        res.status(200).json({
          success: true,
          data: link
        });
      } catch (error) {
        res.status(400).json({
          success: false,
          message: error.message
        });
      }
      break;
    case "DELETE":
      try {
        const deletedLink = await shortLink.deleteOne({
          id: id
        });
        if (deletedLink.deletedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Link tidak ditemukan."
          });
        }
        res.status(200).json({
          success: true,
          data: {}
        });
      } catch (error) {
        res.status(400).json({
          success: false,
          message: error.message
        });
      }
      break;
    default:
      res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
      res.status(405).end(`Method ${method} Not Allowed`);
      break;
  }
}