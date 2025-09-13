import dbConnect from "@/lib/mongoose";
import akiSession from "@/models/Akinator";
import {
  Akinator
} from "@/lib/game/akinator";
export default async function handler(req, res) {
  const {
    action,
    session_id,
    ...params
  } = req.method === "GET" ? req.query : req.body;
  if (!action) {
    return res.status(400).json({
      error: "Action is required."
    });
  }
  await dbConnect();
  try {
    let response;
    let sessionData;
    switch (action) {
      case "create":
        const aki = new Akinator(params.region || "id");
        response = await aki.create();
        sessionData = new akiSession({
          session: aki.session,
          signature: aki.signature,
          step: aki.currentStep,
          progression: aki.progression,
          region: params.region || "id",
          gameState: {
            cookieJar: Object.fromEntries(aki.cookieJar),
            finished: false
          }
        });
        await sessionData.save();
        return res.status(200).json({
          session_id: sessionData._id.toString(),
          ...response
        });
      case "answer":
        if (!session_id || !params.hasOwnProperty("answerId")) {
          return res.status(400).json({
            error: "session_id and answerId are required for answer."
          });
        }
        sessionData = await akiSession.findById(session_id);
        if (!sessionData) {
          return res.status(404).json({
            error: "Session not found."
          });
        }
        const akiAnswer = new Akinator(sessionData.region);
        akiAnswer.session = sessionData.session;
        akiAnswer.signature = sessionData.signature;
        akiAnswer.currentStep = sessionData.step;
        akiAnswer.progression = sessionData.progression;
        if (sessionData.gameState.cookieJar) {
          akiAnswer.cookieJar = new Map(Object.entries(sessionData.gameState.cookieJar));
        }
        response = await akiAnswer.step({
          answerId: parseInt(params.answerId)
        });
        sessionData.session = akiAnswer.session;
        sessionData.signature = akiAnswer.signature;
        sessionData.step = akiAnswer.currentStep;
        sessionData.progression = akiAnswer.progression;
        sessionData.gameState.cookieJar = Object.fromEntries(akiAnswer.cookieJar);
        sessionData.gameState.finished = response.finished || false;
        sessionData.updatedAt = new Date();
        await sessionData.save();
        return res.status(200).json({
          session_id: session_id,
          ...response
        });
      case "cancel":
        if (!session_id) {
          return res.status(400).json({
            error: "session_id is required for cancel."
          });
        }
        sessionData = await akiSession.findById(session_id);
        if (!sessionData) {
          return res.status(404).json({
            error: "Session not found."
          });
        }
        const akiCancel = new Akinator(sessionData.region);
        akiCancel.session = sessionData.session;
        akiCancel.signature = sessionData.signature;
        akiCancel.currentStep = sessionData.step;
        akiCancel.progression = sessionData.progression;
        if (sessionData.gameState.cookieJar) {
          akiCancel.cookieJar = new Map(Object.entries(sessionData.gameState.cookieJar));
        }
        response = await akiCancel.cancelAnswer();
        sessionData.step = akiCancel.currentStep;
        sessionData.progression = akiCancel.progression;
        sessionData.gameState.cookieJar = Object.fromEntries(akiCancel.cookieJar);
        sessionData.updatedAt = new Date();
        await sessionData.save();
        return res.status(200).json({
          session_id: session_id,
          ...response
        });
      case "continue":
        if (!session_id) {
          return res.status(400).json({
            error: "session_id is required for continue."
          });
        }
        sessionData = await akiSession.findById(session_id);
        if (!sessionData) {
          return res.status(404).json({
            error: "Session not found."
          });
        }
        const akiContinue = new Akinator(sessionData.region);
        akiContinue.session = sessionData.session;
        akiContinue.signature = sessionData.signature;
        akiContinue.currentStep = sessionData.step;
        akiContinue.progression = sessionData.progression;
        if (sessionData.gameState.cookieJar) {
          akiContinue.cookieJar = new Map(Object.entries(sessionData.gameState.cookieJar));
        }
        response = await akiContinue.continueGame();
        sessionData.step = akiContinue.currentStep;
        sessionData.progression = akiContinue.progression;
        sessionData.gameState.cookieJar = Object.fromEntries(akiContinue.cookieJar);
        sessionData.gameState.finished = false;
        sessionData.updatedAt = new Date();
        await sessionData.save();
        return res.status(200).json({
          session_id: session_id,
          ...response
        });
      case "status":
        if (!session_id) {
          return res.status(400).json({
            error: "session_id is required for status."
          });
        }
        sessionData = await akiSession.findById(session_id);
        if (!sessionData) {
          return res.status(404).json({
            error: "Session not found."
          });
        }
        return res.status(200).json({
          session_id: session_id,
          session: sessionData.session,
          step: sessionData.step,
          progression: sessionData.progression,
          region: sessionData.region,
          finished: sessionData.gameState.finished,
          createdAt: sessionData.createdAt,
          updatedAt: sessionData.updatedAt
        });
      case "delete":
        if (!session_id) {
          return res.status(400).json({
            error: "session_id is required for delete."
          });
        }
        const deletedSession = await akiSession.findByIdAndDelete(session_id);
        if (!deletedSession) {
          return res.status(404).json({
            error: "Session not found."
          });
        }
        return res.status(200).json({
          message: "Session deleted successfully.",
          session_id: session_id
        });
      case "list":
        const page = parseInt(params.page) || 1;
        const limit = parseInt(params.limit) || 10;
        const skip = (page - 1) * limit;
        const sessions = await akiSession.find().sort({
          updatedAt: -1
        }).skip(skip).limit(limit).select("_id step progression region createdAt updatedAt gameState.finished");
        const total = await akiSession.countDocuments();
        return res.status(200).json({
          sessions: sessions.map(session => ({
            session_id: session._id.toString(),
            step: session.step,
            progression: session.progression,
            region: session.region,
            finished: session.gameState.finished,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt
          })),
          pagination: {
            page: page,
            limit: limit,
            total: total,
            pages: Math.ceil(total / limit)
          }
        });
      default:
        return res.status(400).json({
          error: `Invalid action: ${action}. Supported actions are 'create', 'answer', 'cancel', 'continue', 'status', 'delete', and 'list'.`
        });
    }
  } catch (error) {
    console.error("Akinator API Error:", error);
    return res.status(500).json({
      error: error.message || "Internal Server Error"
    });
  }
}