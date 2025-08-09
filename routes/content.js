const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Content = require('../models/Content');
const { authenticateToken, requireAdmin, requireAdminOrSupport, optionalAuth } = require('../middleware/auth');
const router = express.Router();

// Helper function to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// @route   GET /api/content
// @desc    Get published content with filters
// @access  Public
router.get('/', optionalAuth, [
  query('type')
    .optional()
    .isIn(['faq', 'tip', 'blog', 'guide', 'announcement'])
    .withMessage('Invalid content type'),
  query('category')
    .optional()
    .isIn(['animal_health', 'crop_guidance', 'nutrition', 'general', 'emergency', 'technology'])
    .withMessage('Invalid category'),
  query('language')
    .optional()
    .isIn(['english', 'hindi', 'telugu'])
    .withMessage('Invalid language'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50'),
  query('search')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Search term too long')
], handleValidationErrors, async (req, res) => {
  try {
    const {
      type,
      category,
      language = req.user?.preferredLanguage || 'english',
      page = 1,
      limit = 20,
      search,
      tags,
      farmingTypes,
      regions,
      difficulty
    } = req.query;

    // Build filters
    const filters = {
      type,
      category,
      tags: tags ? tags.split(',') : undefined,
      farmingTypes: farmingTypes ? farmingTypes.split(',') : undefined,
      regions: regions ? regions.split(',') : undefined,
      isPremium: req.user?.subscription?.status === 'active' ? undefined : false
    };

    // Remove undefined filters
    Object.keys(filters).forEach(key => {
      if (filters[key] === undefined) {
        delete filters[key];
      }
    });

    // Add difficulty filter if provided
    if (difficulty) {
      filters['metadata.difficulty'] = difficulty;
    }

    // Search content
    const content = await Content.searchContent(search, filters);
    
    // Apply pagination
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedContent = content.slice(startIndex, endIndex);

    // Get localized content
    const localizedContent = paginatedContent.map(item => 
      item.getLocalizedContent(language)
    );

    // Calculate pagination info
    const totalContent = content.length;
    const totalPages = Math.ceil(totalContent / parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        content: localizedContent,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalContent,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1,
          limit: parseInt(limit)
        },
        filters: {
          type,
          category,
          language,
          search,
          tags: tags?.split(','),
          farmingTypes: farmingTypes?.split(','),
          regions: regions?.split(','),
          difficulty
        }
      }
    });

  } catch (error) {
    console.error('Get content error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch content'
    });
  }
});

// @route   GET /api/content/trending
// @desc    Get trending content
// @access  Public
router.get('/trending', optionalAuth, [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage('Limit must be between 1 and 20'),
  query('language')
    .optional()
    .isIn(['english', 'hindi', 'telugu'])
    .withMessage('Invalid language')
], handleValidationErrors, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const language = req.query.language || req.user?.preferredLanguage || 'english';

    const trendingContent = await Content.getTrendingContent(limit);
    
    // Get localized content
    const localizedContent = trendingContent.map(item => 
      item.getLocalizedContent(language)
    );

    res.status(200).json({
      success: true,
      data: {
        content: localizedContent
      }
    });

  } catch (error) {
    console.error('Get trending content error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch trending content'
    });
  }
});

// @route   GET /api/content/:slug
// @desc    Get specific content by slug
// @access  Public
router.get('/:slug', optionalAuth, async (req, res) => {
  try {
    const { slug } = req.params;
    const language = req.query.language || req.user?.preferredLanguage || 'english';

    const content = await Content.findOne({ 
      slug,
      status: 'published',
      publishedAt: { $lte: new Date() }
    }).populate('author', 'name');

    if (!content) {
      return res.status(404).json({
        success: false,
        message: 'Content not found'
      });
    }

    // Check premium content access
    if (content.isPremium && (!req.user || req.user.subscription.status !== 'active')) {
      return res.status(403).json({
        success: false,
        message: 'Premium subscription required to access this content',
        code: 'PREMIUM_REQUIRED'
      });
    }

    // Increment view count
    await content.incrementViews();

    // Get localized content
    const localizedContent = content.getLocalizedContent(language);
    
    // Add author info
    localizedContent.author = {
      name: content.author?.name || 'Prani Mitra Team'
    };

    // Get related content
    const relatedContent = await Content.find({
      _id: { $ne: content._id },
      category: content.category,
      status: 'published',
      publishedAt: { $lte: new Date() },
      isPremium: req.user?.subscription?.status === 'active' ? undefined : false
    })
    .limit(5)
    .select('title slug excerpt media.featuredImage publishedAt');

    const localizedRelatedContent = relatedContent.map(item => 
      item.getLocalizedContent(language)
    );

    res.status(200).json({
      success: true,
      data: {
        content: localizedContent,
        relatedContent: localizedRelatedContent
      }
    });

  } catch (error) {
    console.error('Get content by slug error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch content'
    });
  }
});

// @route   POST /api/content/:contentId/comment
// @desc    Add comment to content
// @access  Private
router.post('/:contentId/comment', authenticateToken, [
  body('content')
    .trim()
    .notEmpty()
    .isLength({ max: 1000 })
    .withMessage('Comment must not exceed 1000 characters'),
  body('language')
    .optional()
    .isIn(['english', 'hindi', 'telugu'])
    .withMessage('Invalid language')
], handleValidationErrors, async (req, res) => {
  try {
    const { contentId } = req.params;
    const userId = req.userId;
    const { content: commentContent, language } = req.body;

    const content = await Content.findById(contentId);
    
    if (!content) {
      return res.status(404).json({
        success: false,
        message: 'Content not found'
      });
    }

    // Add comment
    await content.addComment(
      userId, 
      commentContent, 
      language || req.user.preferredLanguage || 'english'
    );

    res.status(201).json({
      success: true,
      message: 'Comment added successfully (pending approval)'
    });

  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add comment'
    });
  }
});

// @route   GET /api/content/categories/stats
// @desc    Get content statistics by category
// @access  Public
router.get('/categories/stats', optionalAuth, async (req, res) => {
  try {
    const isPremiumUser = req.user?.subscription?.status === 'active';
    
    const stats = await Content.aggregate([
      {
        $match: {
          status: 'published',
          publishedAt: { $lte: new Date() },
          ...(isPremiumUser ? {} : { isPremium: false })
        }
      },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          types: { $addToSet: '$type' },
          latestUpdate: { $max: '$publishedAt' }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    // Add category display names
    const categoryNames = {
      animal_health: { en: 'Animal Health', hi: 'पशु स्वास्थ्य', te: 'పశు ఆరోగ్యం' },
      crop_guidance: { en: 'Crop Guidance', hi: 'फसल मार्गदर्शन', te: 'పంట మార్గదర్శకత्वం' },
      nutrition: { en: 'Nutrition', hi: 'पोषण', te: 'పోషణ' },
      general: { en: 'General', hi: 'सामान्य', te: 'సాధారణ' },
      emergency: { en: 'Emergency', hi: 'आपातकाल', te: 'అత్యవసరం' },
      technology: { en: 'Technology', hi: 'प्रौद्योगिकी', te: 'సాంకేతికత' }
    };

    const enrichedStats = stats.map(stat => ({
      category: stat._id,
      displayName: categoryNames[stat._id] || { en: stat._id, hi: stat._id, te: stat._id },
      count: stat.count,
      types: stat.types,
      latestUpdate: stat.latestUpdate
    }));

    res.status(200).json({
      success: true,
      data: {
        categories: enrichedStats,
        totalCategories: stats.length,
        totalContent: stats.reduce((sum, stat) => sum + stat.count, 0)
      }
    });

  } catch (error) {
    console.error('Get category stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch category statistics'
    });
  }
});

// Admin routes for content management

// @route   POST /api/content
// @desc    Create new content (Admin only)
// @access  Private/Admin
router.post('/', authenticateToken, requireAdminOrSupport, [
  body('title.en')
    .trim()
    .notEmpty()
    .withMessage('English title is required'),
  body('title.hi')
    .trim()
    .notEmpty()
    .withMessage('Hindi title is required'),
  body('title.te')
    .trim()
    .notEmpty()
    .withMessage('Telugu title is required'),
  body('content.en')
    .trim()
    .notEmpty()
    .withMessage('English content is required'),
  body('content.hi')
    .trim()
    .notEmpty()
    .withMessage('Hindi content is required'),
  body('content.te')
    .trim()
    .notEmpty()
    .withMessage('Telugu content is required'),
  body('type')
    .isIn(['faq', 'tip', 'blog', 'guide', 'announcement'])
    .withMessage('Invalid content type'),
  body('category')
    .isIn(['animal_health', 'crop_guidance', 'nutrition', 'general', 'emergency', 'technology'])
    .withMessage('Invalid category'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('isPremium')
    .optional()
    .isBoolean()
    .withMessage('isPremium must be a boolean'),
  body('scheduledAt')
    .optional()
    .isISO8601()
    .withMessage('Invalid scheduled date format')
], handleValidationErrors, async (req, res) => {
  try {
    const contentData = {
      ...req.body,
      author: req.userId,
      status: req.body.status || 'draft'
    };

    // Generate slug from English title if not provided
    if (!contentData.slug) {
      contentData.slug = contentData.title.en
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    }

    // Check if slug already exists
    const existingContent = await Content.findOne({ slug: contentData.slug });
    if (existingContent) {
      contentData.slug = `${contentData.slug}-${Date.now()}`;
    }

    const content = new Content(contentData);
    await content.save();

    res.status(201).json({
      success: true,
      message: 'Content created successfully',
      data: { content }
    });

  } catch (error) {
    console.error('Create content error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create content'
    });
  }
});

// @route   PUT /api/content/:contentId
// @desc    Update content (Admin only)
// @access  Private/Admin
router.put('/:contentId', authenticateToken, requireAdminOrSupport, [
  body('title.en')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('English title cannot be empty'),
  body('title.hi')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Hindi title cannot be empty'),
  body('title.te')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Telugu title cannot be empty'),
  body('status')
    .optional()
    .isIn(['draft', 'published', 'archived'])
    .withMessage('Invalid status'),
  body('type')
    .optional()
    .isIn(['faq', 'tip', 'blog', 'guide', 'announcement'])
    .withMessage('Invalid content type'),
  body('category')
    .optional()
    .isIn(['animal_health', 'crop_guidance', 'nutrition', 'general', 'emergency', 'technology'])
    .withMessage('Invalid category')
], handleValidationErrors, async (req, res) => {
  try {
    const { contentId } = req.params;
    const updates = req.body;

    const content = await Content.findByIdAndUpdate(
      contentId,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!content) {
      return res.status(404).json({
        success: false,
        message: 'Content not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Content updated successfully',
      data: { content }
    });

  } catch (error) {
    console.error('Update content error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update content'
    });
  }
});

// @route   DELETE /api/content/:contentId
// @desc    Delete content (Admin only)
// @access  Private/Admin
router.delete('/:contentId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { contentId } = req.params;

    const content = await Content.findByIdAndUpdate(
      contentId,
      { status: 'archived' },
      { new: true }
    );

    if (!content) {
      return res.status(404).json({
        success: false,
        message: 'Content not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Content archived successfully'
    });

  } catch (error) {
    console.error('Delete content error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete content'
    });
  }
});

// @route   GET /api/content/admin/all
// @desc    Get all content including drafts (Admin only)
// @access  Private/Admin
router.get('/admin/all', authenticateToken, requireAdminOrSupport, [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('status')
    .optional()
    .isIn(['draft', 'published', 'archived'])
    .withMessage('Invalid status'),
  query('type')
    .optional()
    .isIn(['faq', 'tip', 'blog', 'guide', 'announcement'])
    .withMessage('Invalid content type'),
  query('category')
    .optional()
    .isIn(['animal_health', 'crop_guidance', 'nutrition', 'general', 'emergency', 'technology'])
    .withMessage('Invalid category')
], handleValidationErrors, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      type,
      category,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter
    const filter = {};
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (category) filter.category = category;
    if (search) {
      filter.$or = [
        { 'title.en': { $regex: search, $options: 'i' } },
        { 'title.hi': { $regex: search, $options: 'i' } },
        { 'title.te': { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } }
      ];
    }

    // Get content with pagination
    const content = await Content.find(filter)
      .populate('author', 'name')
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    // Get total count for pagination
    const totalContent = await Content.countDocuments(filter);
    const totalPages = Math.ceil(totalContent / parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        content,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalContent,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1,
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Get all content error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch content'
    });
  }
});

// @route   PUT /api/content/:contentId/comments/:commentId/approve
// @desc    Approve comment (Admin only)
// @access  Private/Admin
router.put('/:contentId/comments/:commentId/approve', authenticateToken, requireAdminOrSupport, async (req, res) => {
  try {
    const { contentId, commentId } = req.params;

    const content = await Content.findById(contentId);
    
    if (!content) {
      return res.status(404).json({
        success: false,
        message: 'Content not found'
      });
    }

    const comment = content.engagement.comments.id(commentId);
    
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
    }

    comment.isApproved = true;
    await content.save();

    res.status(200).json({
      success: true,
      message: 'Comment approved successfully'
    });

  } catch (error) {
    console.error('Approve comment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve comment'
    });
  }
});

module.exports = router;
