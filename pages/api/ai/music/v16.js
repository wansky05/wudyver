// Import the axios library.
import axios from 'axios';

class VozartApi {
  /**
   * Initializes a new instance of the VozartApi class.
   * A temporary session ID is generated in the constructor to be used
   * for all requests made by this instance.
   */
  constructor() {
    // Generate a temporary session ID using Math.random().
    this.xTempSession = `task_${Math.random().toString(36).substring(2, 15)}`;

    // Set up a base Axios instance with default headers from the curl commands.
    this.axiosInstance = axios.create({
      baseURL: 'https://vozart.ai/api',
      headers: {
        'Accept': 'application/json',
        'Accept-Language': 'id-ID,id;q=0.9',
        'Authorization': 'Bearer null',
        'Content-Type': 'application/json',
        'Origin': 'https://vozart.ai',
        'Referer': 'https://vozart.ai/',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36',
        'x-temp-session': this.xTempSession,
      }
    });
  }

  /**
   * Submits a request to generate lyrics based on a prompt.
   * @param {object} params - The parameters for the lyrics generation.
   * @param {string} [params.prompt='hell'] - The text prompt for the lyrics.
   * @param {string} [params.lang='English'] - The language for the lyrics.
   * @param {object} rest - Any other additional parameters.
   * @returns {Promise<object>} A promise that resolves with an object containing the task_id and response data.
   */
  async lyrics({ prompt = `[Verse]\nAisles stretching out like endless dreams\nCereal boxes and canned food schemes\nPickle jars and pasta towers\nLost for hours in neon flowered scenes\n[Chorus]\nTrolley rolling to a distant beat\nDancing down the frozen treat street\nMilk's going wild in the dairy lane\nGet lost with me in this bizarre terrain`, lang = 'English', ...rest } = {}) {
    console.log(`Submitting request for lyrics with prompt: "${prompt}"`);
    const payload = {
      model: 'text-to-lyrics-custom',
      params: {
        prompt,
        lang,
      },
      attachments: rest.attachments || [],
      showPublic: rest.showPublic || 0,
    };

    try {
      const response = await this.axiosInstance.post('/tools/text-to-lyrics/submit', payload);
      console.log('Lyrics generation task submitted successfully.');
      return { task_id: this.xTempSession, ...response.data };
    } catch (error) {
      console.error('Error submitting lyrics generation task:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Submits a request to create music from lyrics.
   * @param {object} params - The parameters for the music creation.
   * @param {string} [params.lyrics='[Intro]\n(Synth arpeggios and distant, distorted screams fade in)\nJust another soul on the edge of the world.'] - The lyrics for the music.
   * @param {string} [params.prompt='A dramatic and dark song about a mysterious place.'] - The text prompt for the music.
   * @param {boolean} [params.instrumental=false] - Whether the music should be instrumental.
   * @param {string} [params.title='Echoes of the Abyss'] - The title of the music.
   * @param {string} [params.tags='male vocal, dark, dramatic, electric guitar, synthesizer, male lead'] - Tags for the music.
   * @param {string} [params.negativeTags='hd'] - Negative tags to avoid.
   * @param {boolean} [params.public=true] - Whether the music should be public.
   * @param {string} [params.lang='en'] - The language of the music.
   * @param {object} rest - Any other additional parameters for the music model.
   * @returns {Promise<object>} A promise that resolves with an object containing the task_id and response data.
   */
  async create({
    lyrics = `[Verse]\nAisles stretching out like endless dreams\nCereal boxes and canned food schemes\nPickle jars and pasta towers\nLost for hours in neon flowered scenes\n[Chorus]\nTrolley rolling to a distant beat\nDancing down the frozen treat street\nMilk's going wild in the dairy lane\nGet lost with me in this bizarre terrain`,
    prompt = 'A dramatic and dark song about a mysterious place.',
    instrumental = false,
    title = 'Echoes of the Abyss',
    tags = 'male vocal, dark, dramatic, electric guitar, synthesizer, male lead',
    negativeTags = 'hd',
    public: isPublic = true,
    lang = 'en',
    ...rest
  } = {}) {
    console.log('Submitting request to create music...');
    const payload = {
      model: 'chirp-v4',
      params: {
        customMode: true,
        model: 'chirp-v4',
        lyrics,
        prompt,
        instrumental,
        title,
        tags,
        negativeTags,
        public: isPublic,
        lang,
      },0
      attachments: rest.attachments || [],
      showPublic: rest.showPublic || 0,
    };

    try {
      const response = await this.axiosInstance.post('/tools/audio-text-to-music/submit', payload);
      console.log('Music creation task submitted successfully.');
      return { task_id: this.xTempSession, ...response.data };
    } catch (error) {
      console.error('Error submitting music creation task:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Fetches the usage status for a specific tool, using the provided task_id in the headers.
   * @param {object} params - The parameters for the status check.
   * @param {string} [params.task_id=''] - The ID of the task to track. This value is used for the 'x-temp-session' header.
   * @param {string} [params.tool='audio-text-to-music'] - The name of the tool to check status for.
   * @param {number} [params.page=1] - The page number for the usage list.
   * @param {object} rest - Any other additional parameters.
   * @returns {Promise<object>} A promise that resolves with an object containing the input task_id and response data.
   */
  async status({ task_id = '', tool = 'audio-text-to-music', page = 1, ...rest } = {}) {
    console.log(`Fetching usage status for tool: '${tool}' on page ${page}`);
    
    try {
      // Build headers for this specific request by copying defaults and overriding x-temp-session.
      const headers = {
        ...this.axiosInstance.defaults.headers,
        'x-temp-session': task_id || this.xTempSession,
      };

      const response = await this.axiosInstance.get(`/tools/usage?page=${page}&tool=${tool}`, { headers });
      console.log('Usage status fetched successfully.');
      
      // Return the input task_id along with the response data.
      return { task_id, ...response.data };
    } catch (error) {
      console.error('Error fetching usage status:', error.response?.data || error.message);
      throw error;
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
  const generator = new VozartApi();
  try {
    switch (action) {
      case "create":
        if (!params.lyrics) {
          return res.status(400).json({
            error: "lyrics is required for 'create' action."
          });
        }
        const createResponse = await generator.create(params);
        return res.status(200).json(createResponse);
      case "status":
        if (!params.task_id) {
          return res.status(400).json({
            error: "task_id is required for 'status' action."
          });
        }
        const statusResponse = await generator.status(params);
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