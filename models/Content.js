const mongoose = require('mongoose');

const contentSchema = new mongoose.Schema({
  title: {
    en: { type: String, required: true },
    hi: { type: String, required: true },
    te: { type: String, required: true }
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  content: {
    en: { type: String, required: true },
    hi: { type: String, required: true },
    te: { type: String, required: true }
  },
  excerpt: {
    en: String,
    hi: String,
    te: String
  },
  type: {
    type: String,
    enum: ['faq', 'tip', 'blog', 'guide', 'announcement'],
    required: true
  },
  category: {
    type: String,
    enum: ['animal_health', 'crop_guidance', 'nutrition', 'general', 'emergency', 'technology'],
    required: true
  },
  tags: [String],
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft'
  },
  priority: {
    type: Number,
    default: 0
  },
  metadata: {
    readTime: Number, // in minutes
    difficulty: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced']
    },
    season: [{
      type: String,
      enum: ['summer', 'monsoon', 'winter', 'all']
    }],
    regions: [String], // applicable regions/states
    farmingTypes: [{
      type: String,
      enum: ['crops', 'dairy', 'poultry', 'goats', 'sheep', 'fishery', 'mixed']
    }]
  },
  media: {
    featuredImage: {
      url: String,
      alt: {
        en: String,
        hi: String,
        te: String
      }
    },
    images: [{
      url: String,
      caption: {
        en: String,
        hi: String,
        te: String
      },
      alt: {
        en: String,
        hi: String,
        te: String
      }
    }],
    videos: [{
      url: String,
      title: {
        en: String,
        hi: String,
        te: String
      },
      duration: Number // in seconds
    }],
    audio: [{
      url: String,
      title: {
        en: String,
        hi: String,
        te: String
      },
      duration: Number // in seconds
    }]
  },
  seo: {
    metaTitle: {
      en: String,
      hi: String,
      te: String
    },
    metaDescription: {
      en: String,
      hi: String,
      te: String
    },
    keywords: [String]
  },
  engagement: {
    views: {
      type: Number,
      default: 0
    },
    likes: {
      type: Number,
      default: 0
    },
    shares: {
      type: Number,
      default: 0
    },
    comments: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      content: String,
      language: {
        type: String,
        enum: ['english', 'hindi', 'telugu']
      },
      isApproved: {
        type: Boolean,
        default: false
      },
      createdAt: {
        type: Date,
        default: Date.now
      }
    }]
  },
  relatedContent: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Content'
  }],
  publishedAt: Date,
  scheduledAt: Date,
  isPublic: {
    type: Boolean,
    default: true
  },
  isPremium: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
contentSchema.index({ slug: 1 });
contentSchema.index({ type: 1, status: 1, publishedAt: -1 });
contentSchema.index({ category: 1, status: 1 });
contentSchema.index({ tags: 1 });
contentSchema.index({ 'metadata.farmingTypes': 1 });
contentSchema.index({ 'metadata.regions': 1 });
contentSchema.index({ status: 1, scheduledAt: 1 });
contentSchema.index({ createdAt: -1 });

// Virtual for localized content
contentSchema.virtual('localizedContent').get(function() {
  return {
    en: {
      title: this.title.en,
      content: this.content.en,
      excerpt: this.excerpt?.en,
      metaTitle: this.seo?.metaTitle?.en,
      metaDescription: this.seo?.metaDescription?.en
    },
    hi: {
      title: this.title.hi,
      content: this.content.hi,
      excerpt: this.excerpt?.hi,
      metaTitle: this.seo?.metaTitle?.hi,
      metaDescription: this.seo?.metaDescription?.hi
    },
    te: {
      title: this.title.te,
      content: this.content.te,
      excerpt: this.excerpt?.te,
      metaTitle: this.seo?.metaTitle?.te,
      metaDescription: this.seo?.metaDescription?.te
    }
  };
});

// Method to get content in specific language
contentSchema.methods.getLocalizedContent = function(language = 'en') {
  const langCode = language === 'hindi' ? 'hi' : 
                   language === 'telugu' ? 'te' : 'en';
  
  return {
    id: this._id,
    title: this.title[langCode] || this.title.en,
    content: this.content[langCode] || this.content.en,
    excerpt: this.excerpt?.[langCode] || this.excerpt?.en,
    slug: this.slug,
    type: this.type,
    category: this.category,
    tags: this.tags,
    metadata: this.metadata,
    media: {
      ...this.media,
      featuredImage: this.media?.featuredImage ? {
        url: this.media.featuredImage.url,
        alt: this.media.featuredImage.alt?.[langCode] || this.media.featuredImage.alt?.en
      } : undefined
    },
    engagement: {
      views: this.engagement.views,
      likes: this.engagement.likes,
      shares: this.engagement.shares,
      commentsCount: this.engagement.comments?.length || 0
    },
    publishedAt: this.publishedAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

// Method to increment view count
contentSchema.methods.incrementViews = function() {
  this.engagement.views += 1;
  return this.save();
};

// Method to add comment
contentSchema.methods.addComment = function(userId, content, language) {
  this.engagement.comments.push({
    userId,
    content,
    language,
    createdAt: new Date()
  });
  return this.save();
};

// Static method to search content
contentSchema.statics.searchContent = function(query, filters = {}) {
  const searchStage = {
    status: 'published',
    publishedAt: { $lte: new Date() }
  };
  
  // Add filters
  if (filters.type) searchStage.type = filters.type;
  if (filters.category) searchStage.category = filters.category;
  if (filters.tags && filters.tags.length > 0) searchStage.tags = { $in: filters.tags };
  if (filters.farmingTypes && filters.farmingTypes.length > 0) {
    searchStage['metadata.farmingTypes'] = { $in: filters.farmingTypes };
  }
  if (filters.regions && filters.regions.length > 0) {
    searchStage['metadata.regions'] = { $in: filters.regions };
  }
  if (filters.isPremium !== undefined) searchStage.isPremium = filters.isPremium;
  
  // Text search
  if (query) {
    searchStage.$or = [
      { 'title.en': { $regex: query, $options: 'i' } },
      { 'title.hi': { $regex: query, $options: 'i' } },
      { 'title.te': { $regex: query, $options: 'i' } },
      { 'content.en': { $regex: query, $options: 'i' } },
      { 'content.hi': { $regex: query, $options: 'i' } },
      { 'content.te': { $regex: query, $options: 'i' } },
      { tags: { $regex: query, $options: 'i' } }
    ];
  }
  
  return this.find(searchStage)
    .populate('author', 'name')
    .sort({ priority: -1, publishedAt: -1 });
};

// Static method to get trending content
contentSchema.statics.getTrendingContent = function(limit = 10) {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  
  return this.find({
    status: 'published',
    publishedAt: { $gte: oneWeekAgo }
  })
  .sort({ 
    'engagement.views': -1, 
    'engagement.likes': -1, 
    publishedAt: -1 
  })
  .limit(limit)
  .populate('author', 'name');
};

// Pre-save middleware
contentSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Set publishedAt when status changes to published
  if (this.isModified('status') && this.status === 'published' && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  
  // Generate slug from English title if not provided
  if (!this.slug && this.title.en) {
    this.slug = this.title.en
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  
  next();
});

module.exports = mongoose.model('Content', contentSchema);
