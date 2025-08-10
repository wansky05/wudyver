import axios from "axios";
import crypto from "crypto";
import apiConfig from "@/configs/apiConfig";
class SunoMusicGenerator {
  constructor() {}
  enc(data) {
    const encoder = new Encoder(apiConfig.PASSWORD);
    const {
      uuid: jsonUuid
    } = encoder.enc({
      data: data,
      method: "combined"
    });
    return jsonUuid;
  }
  dec(uuid) {
    const encoder = new Encoder(apiConfig.PASSWORD);
    const decryptedJson = encoder.dec({
      uuid: uuid,
      method: "combined"
    });
    return decryptedJson.text;
  }
  async create({
    prompt,
    style = "",
    title = "",
    instrumental = false,
    ...rest
  }) {
    try {
      if (!prompt) throw new Error("Prompt is required");
      if (typeof instrumental !== "boolean") throw new Error("Instrumental must be a boolean");
      const {
        data: cf
      } = await axios.get(`https://${apiConfig.DOMAIN_URL}/api/tools/cf-token`, {
        params: {
          mode: "turnstile-min",
          siteKey: "0x4AAAAAAAgeJUEUvYlF2CzO",
          url: "https://songgenerator.io/features/s-45",
          accessKey: "2c9247ce8044d5f87af608a244e10c94c5563b665e5f32a4bb2b2ad17613c1fc"
        }
      });
      const uid = crypto.createHash("md5").update(Date.now().toString()).digest("hex");
      const options = {
        channel: "MUSIC",
        id: 1631,
        type: "features",
        source: "songgenerator.io",
        style: style,
        title: title,
        customMode: false,
        instrumental: instrumental,
        ...rest
      };
      const {
        data: task
      } = await axios.post("https://aiarticle.erweima.ai/api/v1/secondary-page/api/create", {
        prompt: prompt,
        ...options
      }, {
        headers: {
          uniqueid: uid,
          verify: cf.data.token
        }
      });
      const task_id = this.enc({
        uid: uid,
        cfToken: cf.data.token,
        recordId: task.data.recordId
      });
      return {
        task_id: task_id,
        message: "Music generation task initiated successfully. Use the status endpoint to check its progress."
      };
    } catch (error) {
      throw new Error(error.message);
    }
  }
  async status({
    task_id
  }) {
    try {
      if (!task_id) {
        throw new Error("task_id is required to check status.");
      }
      const decryptedData = this.dec(task_id);
      const {
        uid,
        cfToken,
        recordId
      } = decryptedData;
      if (!uid || !cfToken || !recordId) {
        throw new Error("Invalid task_id: Missing required data after decryption.");
      }
      const {
        data
      } = await axios.get(`https://aiarticle.erweima.ai/api/v1/secondary-page/api/${recordId}`, {
        headers: {
          uniqueid: uid,
          verify: cfToken
        }
      });
      if (data.data.state === "success") {
        return {
          status: "success",
          result: JSON.parse(data.data.completeData)
        };
      } else if (data.data.state === "processing" || data.data.state === "pending") {
        return {
          status: "processing",
          message: "Music generation task is still being processed."
        };
      } else {
        return {
          status: data.data.state,
          message: "Task status is unknown or failed.",
          rawData: data.data
        };
      }
    } catch (error) {
      console.error("Error in status check:", error);
      throw new Error(`Failed to check task status: ${error.message}`);
    }
  }
}
export default async function handler(req, res) {
  const {
    action,
    ...params
  } = req.method === "GET" ? req.query : req.body;
  if (!action) {
    return res.status(400).json({
      error: "Action (create or status) is required."
    });
  }
  const sunoGen = new SunoMusicGenerator();
  try {
    switch (action) {
      case "create":
        if (!params.prompt) {
          return res.status(400).json({
            error: "Prompt is required for 'create' action."
          });
        }
        const createResponse = await sunoGen.create(params);
        return res.status(200).json(createResponse);
      case "status":
        if (!params.task_id) {
          return res.status(400).json({
            error: "task_id is required for 'status' action."
          });
        }
        const statusResponse = await sunoGen.status(params);
        return res.status(200).json(statusResponse);
      default:
        return res.status(400).json({
          error: "Invalid action. Supported actions are 'create' and 'status'."
        });
    }
  } catch (error) {
    res.status(500).json({
      error: error.message || "Internal Server Error"
    });
  }
}