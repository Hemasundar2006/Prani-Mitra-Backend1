const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Import models
const User = require('../models/User');
const Plan = require('../models/Plan');
const Content = require('../models/Content');
const Voucher = require('../models/Voucher');

// Sample data
const samplePlans = [
  {
    name: 'free',
    displayName: {
      en: 'Free Plan',
      hi: 'मुफ्त योजना',
      te: 'ఉచిత ప్లాన్'
    },
    description: {
      en: 'Basic access with limited calls for trying our service',
      hi: 'हमारी सेवा आज़माने के लिए सीमित कॉल के साथ बुनियादी पहुंच',
      te: 'మా సేవను ప్రయత్నించడానికి పరిమిత కాల్‌లతో ప్రాథమిక యాక్సెస్'
    },
    price: {
      monthly: 0,
      yearly: 0
    },
    features: [
      {
        name: {
          en: '10 calls per month',
          hi: 'प्रति माह 10 कॉल',
          te: 'నెలకు 10 కాల్‌లు'
        },
        included: true
      },
      {
        name: {
          en: 'SMS summaries',
          hi: 'SMS सारांश',
          te: 'SMS సారాంశాలు'
        },
        included: true
      },
      {
        name: {
          en: 'Basic support',
          hi: 'बुनियादी सहायता',
          te: 'ప్రాథమిక మద్దతు'
        },
        included: true
      },
      {
        name: {
          en: 'Priority support',
          hi: 'प्राथमिकता सहायता',
          te: 'ప్రాధాన్యత మద్దతు'
        },
        included: false
      }
    ],
    limits: {
      callLimit: 10,
      callDurationLimit: 15,
      smsLimit: 20,
      prioritySupport: false
    },
    planType: 'free',
    isActive: true,
    sortOrder: 1,
    metadata: {
      color: '#6c757d',
      icon: 'free-plan',
      popular: false
    }
  },
  {
    name: 'basic',
    displayName: {
      en: 'Basic Plan',
      hi: 'बेसिक प्लान',
      te: 'బేసిక్ ప్లాన్'
    },
    description: {
      en: 'Perfect for small farmers with regular consultation needs',
      hi: 'नियमित परामर्श आवश्यकताओं वाले छोटे किसानों के लिए बिल्कुल सही',
      te: 'సాధారణ సలహా అవసరాలు ఉన్న చిన్న రైతులకు పర్ఫెక్ట్'
    },
    price: {
      monthly: 299,
      yearly: 2999
    },
    features: [
      {
        name: {
          en: '50 calls per month',
          hi: 'प्रति माह 50 कॉल',
          te: 'నెలకు 50 కాల్‌లు'
        },
        included: true
      },
      {
        name: {
          en: 'SMS summaries',
          hi: 'SMS सारांश',
          te: 'SMS సారాంశాలు'
        },
        included: true
      },
      {
        name: {
          en: 'Email support',
          hi: 'ईमेल सहायता',
          te: 'ఇమెయిల్ మద్దతు'
        },
        included: true
      },
      {
        name: {
          en: 'Priority support',
          hi: 'प्राथमिकता सहायता',
          te: 'ప్రాధాన్యత మద్దతు'
        },
        included: false
      }
    ],
    limits: {
      callLimit: 50,
      callDurationLimit: 30,
      smsLimit: 100,
      prioritySupport: false
    },
    planType: 'basic',
    isActive: true,
    sortOrder: 2,
    metadata: {
      color: '#007bff',
      icon: 'basic-plan',
      popular: false
    }
  },
  {
    name: 'premium',
    displayName: {
      en: 'Premium Plan',
      hi: 'प्रीमियम प्लान',
      te: 'ప్రీమియం ప్లాన్'
    },
    description: {
      en: 'Best for commercial farmers with extensive consultation needs',
      hi: 'व्यापक परामर्श आवश्यकताओं वाले वाणिज्यिक किसानों के लिए सर्वोत्तम',
      te: 'విస్తృత సలహా అవసరాలు ఉన్న వాణిజ్య రైతులకు ఉత్తమం'
    },
    price: {
      monthly: 599,
      yearly: 5999
    },
    features: [
      {
        name: {
          en: 'Unlimited calls',
          hi: 'असीमित कॉल',
          te: 'అపరిమిత కాల్‌లు'
        },
        included: true
      },
      {
        name: {
          en: 'SMS summaries',
          hi: 'SMS सारांश',
          te: 'SMS సారాంశాలు'
        },
        included: true
      },
      {
        name: {
          en: 'Priority support',
          hi: 'प्राथमिकता सहायता',
          te: 'ప్రాధాన్యత మద్దతు'
        },
        included: true
      },
      {
        name: {
          en: 'Expert consultation',
          hi: 'विशेषज्ञ परामर्श',
          te: 'నిపుణుల సలహా'
        },
        included: true
      }
    ],
    limits: {
      callLimit: -1, // Unlimited
      callDurationLimit: 60,
      smsLimit: 500,
      prioritySupport: true
    },
    planType: 'premium',
    isActive: true,
    sortOrder: 3,
    metadata: {
      color: '#28a745',
      icon: 'premium-plan',
      badge: 'Most Popular',
      popular: true
    }
  }
];

const sampleContent = [
  {
    title: {
      en: 'Common Cattle Diseases and Prevention',
      hi: 'सामान्य पशु रोग और रोकथाम',
      te: 'సాధారణ పశువుల వ్యాధులు మరియు నివారణ'
    },
    slug: 'common-cattle-diseases-prevention',
    content: {
      en: `# Common Cattle Diseases and Prevention

Cattle health is crucial for successful farming. Here are the most common diseases affecting cattle and how to prevent them:

## 1. Foot and Mouth Disease (FMD)

### Symptoms:
- Fever and loss of appetite
- Blisters on mouth, tongue, and feet
- Excessive drooling
- Lameness

### Prevention:
- Regular vaccination
- Quarantine new animals
- Maintain clean environment
- Avoid contact with infected animals

## 2. Mastitis

### Symptoms:
- Swollen udder
- Reduced milk production
- Changes in milk consistency
- Fever in severe cases

### Prevention:
- Proper milking hygiene
- Regular udder cleaning
- Dry cow therapy
- Nutritional management

## 3. Bovine Tuberculosis

### Symptoms:
- Chronic cough
- Weight loss
- Weakness
- Enlarged lymph nodes

### Prevention:
- Regular testing
- Proper ventilation
- Quarantine infected animals
- Maintain biosecurity

## General Prevention Tips:

1. **Vaccination Schedule**: Follow recommended vaccination schedules
2. **Nutrition**: Provide balanced nutrition
3. **Clean Water**: Ensure access to clean water
4. **Hygiene**: Maintain clean living conditions
5. **Regular Health Checks**: Monitor animals daily

Remember to consult with a veterinarian for proper diagnosis and treatment.`,
      hi: `# सामान्य पशु रोग और रोकथाम

पशु स्वास्थ्य सफल खेती के लिए महत्वपूर्ण है। यहाँ पशुओं को प्रभावित करने वाली सबसे आम बीमारियाँ और उनकी रोकथाम के तरीके हैं:

## 1. मुंह और खुर की बीमारी (FMD)

### लक्षण:
- बुखार और भूख न लगना
- मुंह, जीभ और पैरों पर छाले
- अत्यधिक लार आना
- लंगड़ाना

### रोकथाम:
- नियमित टीकाकरण
- नए जानवरों को अलग रखना
- स्वच्छ वातावरण बनाए रखना
- संक्रमित जानवरों से संपर्क से बचना

## 2. मास्टाइटिस

### लक्षण:
- सूजा हुआ थन
- दूध उत्पादन में कमी
- दूध की स्थिरता में परिवर्तन
- गंभीर मामलों में बुखार

### रोकथाम:
- उचित दुहने की स्वच्छता
- नियमित थन की सफाई
- सूखी गाय की चिकित्सा
- पोषण प्रबंधन

## सामान्य रोकथाम युक्तियाँ:

1. **टीकाकरण कार्यक्रम**: अनुशंसित टीकाकरण कार्यक्रम का पालन करें
2. **पोषण**: संतुलित पोषण प्रदान करें
3. **स्वच्छ पानी**: स्वच्छ पानी की पहुंच सुनिश्चित करें
4. **स्वच्छता**: स्वच्छ रहने की स्थिति बनाए रखें
5. **नियमित स्वास्थ्य जाँच**: जानवरों की दैनिक निगरानी करें`,
      te: `# సాధారణ పశువుల వ్యాధులు మరియు నివారణ

పశువుల ఆరోగ్యం విజయవంతమైన వ్యవసాయానికి కీలకం. పశువులను ప్రభావితం చేసే అత్యంత సాధారణ వ్యాధులు మరియు వాటిని ఎలా నివారించాలో ఇక్కడ ఉన్నాయి:

## 1. కాలు మరియు నోరు వ్యాధి (FMD)

### లక్షణాలు:
- జ్వరం మరియు ఆకలిలేకపోవడం
- నోరు, నాలుక మరియు కాళ్లపై బొబ్బలు
- అధిక లాలాజలం రావడం
- కుంటుట

### నివారణ:
- క్రమం తప్పకుండా టీకాలు వేయించడం
- కొత్త జంతువులను వేరుగా ఉంచడం
- పరిశుభ్రమైన వాతావరణాన్ni కాపాడుకోవడం
- వ్యాధిగ్రస్త జంతువులతో సంపర్కం లేకుండా ఉండడం

## 2. మాస్టైటిస్

### లక్షణాలు:
- వాపు వచ్చిన కొవ్వు
- పాల ఉత్పాదనలో తగ్గుట
- పాలు స్థిరత్వంలో మార్పులు
- తీవ్రమైన సందర్భాలలో జ్వరం

### నివారణ:
- సరైన పాలు పితికే పరిశుభ్రత
- క్రమం తప్పకుండా కొవ్వు శుభ్రపరచడం
- పొడి ఆవు చికిత్స
- పోషకాహార నిర్వహణ

## సాధారణ నివారణ చిట్కాలు:

1. **టీకా కార్యక్రమం**: సిఫార్సు చేయబడిన టీకా కార్యక్రమాలను అనుసరించండి
2. **పోషణ**: సమతుల్య పోషణను అందించండి
3. **శుభ్రమైన నీరు**: శుభ్రమైన నీటికి అందుబాటును నిర్ధారించండి
4. **పరిశుభ్రత**: శుభ్రమైన జీవన పరిస్థితులను కాపాడుకోండి
5. **క్రమం తప్పకుండా ఆరోగ్య పరీక్షలు**: జంతువులను ప్రతిరోజూ పర్యవేక్షించండి`
    },
    excerpt: {
      en: 'Learn about common cattle diseases, their symptoms, and effective prevention methods to keep your livestock healthy.',
      hi: 'सामान्य पशु रोगों, उनके लक्षणों और अपने पशुधन को स्वस्थ रखने के प्रभावी रोकथाम तरीकों के बारे में जानें।',
      te: 'సాధారణ పశువుల వ్యాధులు, వాటి లక్షణాలు మరియు మీ పశువులను ఆరోగ్యంగా ఉంచడానికి ప్రభావవంతమైన నివారణ పద్ధతుల గురించి తెలుసుకోండి।'
    },
    type: 'guide',
    category: 'animal_health',
    tags: ['cattle', 'diseases', 'prevention', 'health', 'livestock'],
    status: 'published',
    priority: 5,
    metadata: {
      readTime: 8,
      difficulty: 'beginner',
      season: ['all'],
      regions: ['telangana', 'andhra-pradesh', 'karnataka', 'maharashtra'],
      farmingTypes: ['dairy', 'mixed']
    },
    media: {
      featuredImage: {
        url: 'https://example.com/images/cattle-health.jpg',
        alt: {
          en: 'Healthy cattle in field',
          hi: 'खेत में स्वस्थ पशु',
          te: 'పొలంలో ఆరోగ్యకరమైన పశువులు'
        }
      }
    },
    seo: {
      metaTitle: {
        en: 'Common Cattle Diseases: Prevention Guide for Farmers',
        hi: 'सामान्य पशु रोग: किसानों के लिए रोकथाम गाइड',
        te: 'సాధారణ పశువుల వ్యాధులు: రైతుల కోసం నివారణ గైడ్'
      },
      metaDescription: {
        en: 'Complete guide on common cattle diseases, symptoms, and prevention methods. Keep your livestock healthy with expert advice.',
        hi: 'सामान्य पशु रोगों, लक्षणों और रोकथाम के तरीकों पर पूर्ण गाइड। विशेषज्ञ सलाह के साथ अपने पशुधन को स्वस्थ रखें।',
        te: 'సాధారణ పశువుల వ్యాధులు, లక్షణాలు మరియు నివారణ పద్ధతులపై పూర్తి గైడ్. నిపుణుల సలహాతో మీ పశువులను ఆరోగ్యంగా ఉంచండి।'
      },
      keywords: ['cattle diseases', 'livestock health', 'animal care', 'farming', 'prevention']
    },
    engagement: {
      views: 0,
      likes: 0,
      shares: 0
    },
    publishedAt: new Date(),
    isPublic: true,
    isPremium: false
  },
  {
    title: {
      en: 'Rice Cultivation: Complete Growing Guide',
      hi: 'चावल की खेती: पूर्ण उगाने की गाइड',
      te: 'వరి సాగు: పూర్తి పెంపకం గైడ్'
    },
    slug: 'rice-cultivation-complete-guide',
    content: {
      en: `# Rice Cultivation: Complete Growing Guide

Rice is one of the most important staple crops globally. This comprehensive guide covers everything you need to know about rice cultivation.

## 1. Soil Preparation

### Soil Requirements:
- Clay or clay-loam soil preferred
- pH range: 5.5 to 7.0
- Good water retention capacity
- Rich in organic matter

### Land Preparation:
1. **Primary Tillage**: Deep plowing after harvest
2. **Secondary Tillage**: Cross plowing and harrowing
3. **Leveling**: Proper field leveling for uniform water distribution
4. **Bunding**: Construction of bunds for water retention

## 2. Seed Selection and Treatment

### Variety Selection:
- Choose varieties suitable for your region
- Consider duration, yield potential, and resistance
- High-yielding varieties: IR64, Swarna, BPT5204

### Seed Treatment:
- Salt water test for seed quality
- Fungicide treatment
- Soaking and sprouting

## 3. Nursery Management

### Nursery Preparation:
- Select well-drained, fertile land
- Apply organic manure
- Prepare raised beds

### Sowing:
- Sowing time: 15-20 days before transplanting
- Seed rate: 40-50 kg/hectare
- Maintain proper water level

## 4. Transplanting

### Timing:
- 20-25 days old seedlings
- Monsoon season for rainfed areas
- Year-round for irrigated areas

### Method:
- Spacing: 20cm x 15cm
- Depth: 2-3 cm
- 2-3 seedlings per hill

## 5. Water Management

### Water Requirements:
- Continuous submergence of 5cm water
- Critical stages: tillering, flowering, grain filling
- Avoid water stress during critical periods

### Irrigation Schedule:
- Maintain water level throughout growing season
- Drain before harvest

## 6. Fertilizer Management

### Nutrient Requirements:
- Nitrogen: 120 kg/ha
- Phosphorus: 60 kg/ha
- Potassium: 40 kg/ha

### Application Schedule:
- **Basal**: 50% N, 100% P, 100% K at transplanting
- **Top Dressing**: 25% N at tillering, 25% N at panicle initiation

## 7. Pest and Disease Management

### Common Pests:
- Stem borer
- Brown plant hopper
- Leaf folder

### Common Diseases:
- Blast
- Bacterial blight
- Sheath blight

### Management:
- Use resistant varieties
- Integrated pest management
- Proper field sanitation

## 8. Harvesting

### Maturity Indicators:
- 80% of grains turn golden yellow
- Moisture content: 20-25%
- 90-120 days after transplanting

### Harvesting Method:
- Cut at ground level
- Bundle and dry in field
- Thresh when moisture is 14%

## Yield Expectations:
- Average yield: 4-6 tons/hectare
- With good management: 6-8 tons/hectare

Follow these guidelines for successful rice cultivation and maximum yield.`,
      hi: `# चावल की खेती: पूर्ण उगाने की गाइड

चावल दुनिया भर में सबसे महत्वपूर्ण मुख्य फसलों में से एक है। यह व्यापक गाइड चावल की खेती के बारे में आपको जानने की जरूरत है सब कुछ कवर करती है।

## 1. मिट्टी की तैयारी

### मिट्टी की आवश्यकताएं:
- चिकनी या चिकनी-दोमट मिट्टी पसंदीदा
- pH रेंज: 5.5 से 7.0
- अच्छी जल धारण क्षमता
- जैविक पदार्थों से भरपूर

### भूमि की तैयारी:
1. **प्राथमिक जुताई**: फसल के बाद गहरी जुताई
2. **द्वितीयक जुताई**: क्रॉस जुताई और हैरोइंग
3. **समतलीकरण**: समान पानी वितरण के लिए उचित खेत समतलीकरण
4. **मेड़बंदी**: पानी की रोकथाम के लिए मेड़ों का निर्माण`,
      te: `# వరి సాగు: పూర్తి పెంపకం గైడ్

వరి ప్రపంచవ్యాప్తంగా అత్యంత ముఖ్యమైన ప్రధాన పంటలలో ఒకటి. ఈ సమగ్ర గైడ్ వరి సాగు గురించి మీరు తెలుసుకోవలసిన అన్నింటిని కవర్ చేస్తుంది।

## 1. నేల తయారీ

### నేల అవసరాలు:
- కేవలం లేదా కేవలం-దోమట నేల అనుకూలం
- pH పరిధి: 5.5 నుండి 7.0
- మంచి నీటి నిలుపుదల సామర్థ్యం
- సేంద్రీయ పదార్థాలు అధికంగా

### భూమి తయారీ:
1. **ప్రాథమిక దున్నుట**: పంట తర్వాత లోతైన దున్నుట
2. **ద్వితీయ దున్నుట**: అడ్డ దున్నుట మరియు హారోయింగ్
3. **సమం చేయుట**: ఏకరూప నీటి పంపిణీ కోసం సరైన పొలం సమం చేయుట
4. **కట్టలు కట్టుట**: నీటి నిలుపుదల కోసం కట్టల నిర్మాణం`
    },
    excerpt: {
      en: 'Comprehensive guide to rice cultivation covering soil preparation, planting, water management, and harvesting techniques.',
      hi: 'मिट्टी की तैयारी, रोपण, पानी प्रबंधन और कटाई तकनीकों को कवर करने वाली चावल की खेती के लिए व्यापक गाइड।',
      te: 'నేల తయారీ, నాటుట, నీటి నిర్వహణ మరియు కోత పద్ధతులను కవర్ చేసే వరి సాగుకు సమగ్ర గైడ్।'
    },
    type: 'guide',
    category: 'crop_guidance',
    tags: ['rice', 'cultivation', 'farming', 'irrigation', 'crops'],
    status: 'published',
    priority: 4,
    metadata: {
      readTime: 12,
      difficulty: 'intermediate',
      season: ['monsoon', 'winter'],
      regions: ['telangana', 'andhra-pradesh', 'west-bengal', 'punjab'],
      farmingTypes: ['crops']
    },
    publishedAt: new Date(),
    isPublic: true,
    isPremium: false
  }
];

const sampleVouchers = [
  {
    code: 'WELCOME50',
    name: 'Welcome Discount',
    description: {
      en: '50% discount for new users',
      hi: 'नए उपयोगकर्ताओं के लिए 50% छूट',
      te: 'కొత్త వినియోగదారులకు 50% తగ్గింపు'
    },
    type: 'percentage',
    value: 50,
    maxDiscount: 300,
    minOrderAmount: 100,
    applicablePlans: [],
    billingCycles: ['monthly', 'yearly'],
    usage: {
      totalLimit: 1000,
      perUserLimit: 1,
      totalUsed: 0
    },
    validity: {
      startDate: new Date(),
      endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year from now
    },
    conditions: {
      firstTimeUser: true,
      userTypes: ['farmer']
    },
    isActive: true,
    isPublic: true,
    metadata: {
      campaign: 'welcome-2024',
      category: 'welcome',
      priority: 1
    }
  },
  {
    code: 'MONSOON25',
    name: 'Monsoon Special',
    description: {
      en: '25% discount during monsoon season',
      hi: 'मानसून के मौसम में 25% छूट',
      te: 'వర్షాకాలంలో 25% తగ్గింపు'
    },
    type: 'percentage',
    value: 25,
    maxDiscount: 150,
    minOrderAmount: 200,
    usage: {
      totalLimit: 500,
      perUserLimit: 1,
      totalUsed: 0
    },
    validity: {
      startDate: new Date(),
      endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days from now
    },
    conditions: {
      farmingTypes: ['crops']
    },
    isActive: true,
    isPublic: true,
    metadata: {
      campaign: 'monsoon-2024',
      category: 'seasonal',
      priority: 2
    }
  }
];

// Database seeding function
async function seedDatabase() {
  try {
    console.log('🌱 Starting database seeding...');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/prani-mitra', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // Clear existing data (optional - comment out if you want to preserve existing data)
    console.log('🧹 Clearing existing data...');
    await Plan.deleteMany({});
    await Content.deleteMany({});
    await Voucher.deleteMany({});
    // Note: Not clearing User data to preserve real users

    // Seed Plans
    console.log('📋 Seeding plans...');
    await Plan.insertMany(samplePlans);
    console.log(`✅ Inserted ${samplePlans.length} plans`);

    // Create admin user if doesn't exist
    console.log('👤 Creating admin user...');
    const adminExists = await User.findOne({ phoneNumber: process.env.ADMIN_PHONE?.replace('+91', '') || '9876543210' });
    
    if (!adminExists) {
      const adminUser = new User({
        phoneNumber: process.env.ADMIN_PHONE?.replace('+91', '') || '9876543210',
        name: 'Admin User',
        email: process.env.ADMIN_EMAIL || 'admin@pranimitra.com',
        preferredLanguage: 'english',
        role: 'admin',
        isVerified: true,
        subscription: {
          status: 'active',
          planId: null // Admin doesn't need a plan
        },
        location: {
          state: 'Telangana',
          district: 'Hyderabad'
        }
      });
      await adminUser.save();
      console.log('✅ Created admin user');
    } else {
      console.log('ℹ️ Admin user already exists');
    }

    // Seed Content (assign to admin user)
    console.log('📝 Seeding content...');
    const adminUser = await User.findOne({ role: 'admin' });
    const contentWithAuthor = sampleContent.map(content => ({
      ...content,
      author: adminUser._id
    }));
    await Content.insertMany(contentWithAuthor);
    console.log(`✅ Inserted ${sampleContent.length} content items`);

    // Seed Vouchers (assign to admin user)
    console.log('🎫 Seeding vouchers...');
    const vouchersWithCreator = sampleVouchers.map(voucher => ({
      ...voucher,
      createdBy: adminUser._id
    }));
    await Voucher.insertMany(vouchersWithCreator);
    console.log(`✅ Inserted ${sampleVouchers.length} vouchers`);

    // Create sample farmer user
    console.log('👨‍🌾 Creating sample farmer user...');
    const farmerExists = await User.findOne({ phoneNumber: '9876543211' });
    
    if (!farmerExists) {
      const farmerUser = new User({
        phoneNumber: '9876543211',
        name: 'Sample Farmer',
        email: 'farmer@example.com',
        preferredLanguage: 'english',
        role: 'farmer',
        isVerified: true,
        subscription: {
          status: 'free'
        },
        location: {
          state: 'Telangana',
          district: 'Warangal',
          village: 'Sample Village',
          pincode: '506001'
        },
        farmingType: ['crops', 'dairy'],
        profile: {
          gender: 'male',
          experience: '5-10years'
        }
      });
      await farmerUser.save();
      console.log('✅ Created sample farmer user');
    } else {
      console.log('ℹ️ Sample farmer user already exists');
    }

    console.log('🎉 Database seeding completed successfully!');
    console.log('\n📊 Seeding Summary:');
    console.log(`   • Plans: ${samplePlans.length}`);
    console.log(`   • Content: ${sampleContent.length}`);
    console.log(`   • Vouchers: ${sampleVouchers.length}`);
    console.log(`   • Users: Admin + Sample Farmer`);
    
    console.log('\n🔑 Login Credentials:');
    console.log(`   • Admin Phone: ${process.env.ADMIN_PHONE?.replace('+91', '') || '9876543210'}`);
    console.log(`   • Farmer Phone: 9876543211`);
    console.log(`   • Use OTP authentication to login`);

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
    process.exit(0);
  }
}

// Run seeding if this file is executed directly
if (require.main === module) {
  seedDatabase();
}

module.exports = {
  seedDatabase,
  samplePlans,
  sampleContent,
  sampleVouchers
};
