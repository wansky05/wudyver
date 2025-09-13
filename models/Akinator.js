// models/Akinator.js
import mongoose from 'mongoose';

const AkinatorSessionSchema = new mongoose.Schema({
  // Data session dari Akinator
  session: {
    type: String,
    required: true
  },
  signature: {
    type: String,
    required: true
  },
  step: {
    type: Number,
    required: true,
    default: 0
  },
  progression: {
    type: Number,
    required: true,
    default: 0.0
  },
  region: {
    type: String,
    required: true,
    default: 'id'
  },
  
  // Game state data
  gameState: {
    cookieJar: {
      type: Object,
      default: {}
    },
    finished: {
      type: Boolean,
      default: false
    },
    currentTheme: {
      type: String,
      default: ''
    },
    childMode: {
      type: String,
      default: 'false'
    },
    stepLastProposition: {
      type: String,
      default: ''
    },
    
    // Proposition data (when Akinator makes a guess)
    proposition: {
      pid: {
        type: String,
        default: ''
      },
      pidbase: {
        type: String,
        default: ''
      },
      name: {
        type: String,
        default: ''
      },
      description: {
        type: String,
        default: ''
      },
      photo: {
        type: String,
        default: ''
      },
      flagPhoto: {
        type: String,
        default: ''
      },
      nbElements: {
        type: String,
        default: '0'
      },
      noQuestion: {
        type: String,
        default: '0'
      }
    }
  },
  
  // Additional metadata
  userAgent: {
    type: String,
    default: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36'
  },
  ipAddress: {
    type: String,
    default: ''
  },
  
  // Game history - menyimpan riwayat pertanyaan dan jawaban
  gameHistory: [{
    step: Number,
    question: String,
    answer: String,
    answerId: Number,
    progression: Number,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true, // Menambahkan createdAt dan updatedAt otomatis
  
  // Index untuk performa query
  indexes: [
    { session: 1 },
    { createdAt: -1 },
    { updatedAt: -1 },
    { 'gameState.finished': 1 }
  ]
});

// Middleware untuk cleanup session lama (opsional)
AkinatorSessionSchema.pre('save', function(next) {
  // Auto cleanup sessions older than 24 hours jika diperlukan
  if (this.isNew) {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    this.constructor.deleteMany({
      updatedAt: { $lt: twentyFourHoursAgo }
    }).catch(err => console.log('Cleanup error:', err));
  }
  next();
});

// Static methods
AkinatorSessionSchema.statics.findBySessionId = function(sessionId) {
  return this.findOne({ _id: sessionId });
};

AkinatorSessionSchema.statics.findActiveSessions = function() {
  return this.find({ 'gameState.finished': false });
};

AkinatorSessionSchema.statics.findFinishedSessions = function() {
  return this.find({ 'gameState.finished': true });
};

AkinatorSessionSchema.statics.cleanupOldSessions = function(hoursOld = 24) {
  const cutoffDate = new Date(Date.now() - hoursOld * 60 * 60 * 1000);
  return this.deleteMany({ updatedAt: { $lt: cutoffDate } });
};

// Instance methods
AkinatorSessionSchema.methods.addToHistory = function(questionData) {
  this.gameHistory.push(questionData);
  return this.save();
};

AkinatorSessionSchema.methods.isExpired = function(hoursOld = 24) {
  const cutoffDate = new Date(Date.now() - hoursOld * 60 * 60 * 1000);
  return this.updatedAt < cutoffDate;
};

// Virtual untuk mendapatkan durasi game
AkinatorSessionSchema.virtual('gameDuration').get(function() {
  return this.updatedAt - this.createdAt;
});

// Transform JSON output
AkinatorSessionSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    ret.session_id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

// Export model
const AkinatorSession = mongoose.models.AkinatorSession || mongoose.model('AkinatorSession', AkinatorSessionSchema);

export default AkinatorSession;