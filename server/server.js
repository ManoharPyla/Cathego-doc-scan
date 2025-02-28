const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const session = require('express-session');

const levenshtein = require('fastest-levenshtein');

const app = express();
const PORT = 3000;

// Set up middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ 
  secret: 'your_secret_key', 
  resave: false, 
  saveUninitialized: true 
}));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Global error handling middleware
app.use((err, req, res, next) => {
    console.error('GLOBAL ERROR HANDLER:', {
        timestamp: new Date().toISOString(),
        path: req.path,
        method: req.method,
        body: req.body,
        error: {
            name: err.name,
            message: err.message,
            stack: err.stack
        }
    });

    res.status(500).json({
        error: 'An unexpected server error occurred',
        details: err.message
    });
});

// Enhanced logging for all requests
app.use((req, res, next) => {
    const requestId = uuidv4();
    req.requestId = requestId;

    console.log(`[${requestId}] REQUEST RECEIVED:`, {
        method: req.method,
        path: req.path,
        timestamp: new Date().toISOString(),
        headers: req.headers,
        body: req.body ? JSON.stringify(req.body).slice(0, 500) : 'No body'
    });

    // Log response
    const originalJson = res.json;
    res.json = function(body) {
        console.log(`[${requestId}] RESPONSE SENT:`, {
            status: res.statusCode,
            body: JSON.stringify(body).slice(0, 500)
        });
        return originalJson.call(this, body);
    };

    next();
});

// CORS and security middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    
    next();
});

// Body size limit and parsing protection
app.use(bodyParser.json({
    limit: '10mb',
    verify: (req, res, buf) => {
        try {
            JSON.parse(buf.toString());
        } catch (e) {
            console.error('Invalid JSON payload:', e);
            throw new Error('Invalid JSON');
        }
    }
}));

// Rate limiting basic implementation
const requestLimits = new Map();
const REQUEST_LIMIT = 100; // requests per minute
const WINDOW_MS = 60 * 1000; // 1 minute

app.use((req, res, next) => {
    const clientIp = req.ip;
    const now = Date.now();
    
    const clientRequests = requestLimits.get(clientIp) || [];
    const recentRequests = clientRequests.filter(time => now - time < WINDOW_MS);
    
    if (recentRequests.length >= REQUEST_LIMIT) {
        return res.status(429).json({
            error: 'Too many requests, please try again later'
        });
    }
    
    recentRequests.push(now);
    requestLimits.set(clientIp, recentRequests);
    
    next();
});

// Initialize data files
const initFile = (filePath, initialData) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(initialData));
  }
};

// Create data directory and files
initFile(path.join(__dirname, 'data', 'users.json'), []);
initFile(path.join(__dirname, 'data', 'documents.json'), []);
initFile(path.join(__dirname, 'data', 'sessions.json'), []);

// Authentication middleware
const authenticate = (req, res, next) => {
  // Check for session authentication first
  if (req.session.user) {
    return next();
  }
  
  // Fallback to token authentication for API calls
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const sessions = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'sessions.json')));
  const session = sessions.find(s => s.token === token);
  
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  req.user = session.user;
  next();
};

// Serve the login page
app.get('/', (req, res) => {
  if (req.session.user) {
    res.redirect('/dashboard');
  } else {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  }
});

// Serve the registration page
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'register.html'));
});

// Serve the dashboard page
app.get('/dashboard', authenticate, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
});

// Registration endpoint
app.post('/api/register', (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  
  const users = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'users.json')));
  
  if (users.some(u => u.email === email)) {
    return res.status(400).json({ error: 'Email already exists' });
  }

  const newUser = {
    id: uuidv4(),
    email,
    password, // Note: In a real app, you should hash this password
    credits: 20
  };
  
  users.push(newUser);
  fs.writeFileSync(path.join(__dirname, 'data', 'users.json'), JSON.stringify(users, null, 2));
  
  res.json({ message: 'Registered successfully' });
});

// Login endpoint
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  
  const users = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'users.json')));
  const user = users.find(u => u.email === email && u.password === password);

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  // Store user in session
  req.session.user = { 
    id: user.id, 
    email: user.email,
    credits: user.credits
  };
  
  // Create API token for potential future use
  const sessions = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'sessions.json')));
  const token = uuidv4();
  
  sessions.push({ 
    token, 
    user: { id: user.id, email: user.email },
    created: new Date().toISOString()
  });
  
  fs.writeFileSync(path.join(__dirname, 'data', 'sessions.json'), JSON.stringify(sessions, null, 2));
  
  res.json({ 
    success: true,
    token, 
    email: user.email,
    credits: user.credits
  });
});

// Get user data endpoint
app.get('/api/user', authenticate, (req, res) => {
  const userId = req.user ? req.user.id : req.session.user.id;
  const users = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'users.json')));
  const user = users.find(u => u.id === userId);
  
  if (!user) {
      return res.status(404).json({ error: 'User not found' });
  }
  
  res.json({
      email: user.email,
      credits: user.credits // Ensure this is being returned correctly
  });
});

// Document upload endpoint
app.post('/api/upload', authenticate, (req, res) => {
  const { name, content, type = 'text' } = req.body;
  
  if (!name || !content) {
    return res.status(400).json({ error: 'Document name and content are required' });
  }
  
  if (content.length < 10) { // Ensure content is at least 10 characters
    return res.status(400).json({ error: 'Document content is too short' });
  }
  
  const userId = req.user ? req.user.id : req.session.user.id;
  const users = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'users.json')));
  const user = users.find(u => u.id === userId);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  if (user.credits < 1) {
    return res.status(400).json({ error: 'Insufficient credits' });
  }
  
  // Deduct a credit
  user.credits--;
  
  // Save document
  const documents = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'documents.json')));
  
  const newDocument = {
    id: uuidv4(),
    userId,
    name,
    content: content.slice(0, 10000), // Limit content length for performance
    type,
    date: new Date().toISOString(),
    metadata: {
      wordCount: content.split(/\s+/).length,
      characterCount: content.length,
      similarityChecks: 0
    }
  };
  
  documents.push(newDocument);
  
  // Save changes
  fs.writeFileSync(path.join(__dirname, 'data', 'users.json'), JSON.stringify(users, null, 2));
  fs.writeFileSync(path.join(__dirname, 'data', 'documents.json'), JSON.stringify(documents, null, 2));
  
  res.json({ 
    success: true,
    credits: user.credits,
    documentId: newDocument.id
  });
});

// Get user's documents endpoint
app.get('/api/documents', authenticate, (req, res) => {
  const userId = req.user ? req.user.id : req.session.user.id;
  const documents = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'documents.json')));
  const userDocuments = documents.filter(doc => doc.userId === userId);
  
  res.json({ 
    success: true,
    documents: userDocuments 
  });
});

// Delete a document endpoint
app.delete('/api/documents/:id', authenticate, (req, res) => {
  const documentId = req.params.id;
  const userId = req.user ? req.user.id : req.session.user.id;

  // Read documents
  const documentsPath = path.join(__dirname, 'data', 'documents.json');
  const documents = JSON.parse(fs.readFileSync(documentsPath));

  // Find the document
  const documentIndex = documents.findIndex(doc => 
    doc.id === documentId && doc.userId === userId
  );

  // Check if document exists and belongs to user
  if (documentIndex === -1) {
    return res.status(404).json({ error: 'Document not found or you do not have permission to delete it' });
  }

  // Remove the document
  documents.splice(documentIndex, 1);

  // Save updated documents
  fs.writeFileSync(documentsPath, JSON.stringify(documents, null, 2));

  res.json({ 
    success: true, 
    message: 'Document deleted successfully' 
  });
});

function calculateDetailedSimilarity(text1, text2) {
    // Enhanced logging for input texts
    console.log('Detailed Similarity Calculation Debug:', {
        text1Length: text1.length,
        text2Length: text2.length,
        text1Preview: text1.slice(0, 100),
        text2Preview: text2.slice(0, 100)
    });

    // More robust preprocessing with additional cleaning
    const cleanText = (text) => {
        if (!text) {
            console.warn('Empty text provided to cleanText');
            return '';
        }
        return text
            .toString()  // Ensure string type
            .toLowerCase()
            .replace(/[^\w\s]/g, '')  // Remove punctuation
            .replace(/\s+/g, ' ')     // Normalize whitespace
            .trim();
    };

    // Validate inputs
    if (!text1 || !text2) {
        console.error('Invalid input texts for similarity calculation', {
            text1: !!text1,
            text2: !!text2
        });
        return {
            overallSimilarity: 0,
            jaccardSimilarity: 0,
            cosineSimilarity: 0,
            levenshteinSimilarity: 0,
            wordMatches: [],
            lineMatches: []
        };
    }

    const cleanedText1 = cleanText(text1);
    const cleanedText2 = cleanText(text2);

    const words1 = cleanedText1.split(' ');
    const words2 = cleanedText2.split(' ');

    // Detailed word-level Jaccard Similarity
    const uniqueWords1 = new Set(words1);
    const uniqueWords2 = new Set(words2);
    const intersection = new Set([...uniqueWords1].filter(word => uniqueWords2.has(word)));
    const union = new Set([...uniqueWords1, ...uniqueWords2]);
    const jaccardSimilarity = intersection.size / union.size;

    console.log('Jaccard Similarity Debug:', {
        uniqueWords1Size: uniqueWords1.size,
        uniqueWords2Size: uniqueWords2.size,
        intersectionSize: intersection.size,
        unionSize: union.size,
        jaccardSimilarity
    });

    // Enhanced Cosine Similarity Calculation
    const wordFreq1 = {};
    const wordFreq2 = {};
    
    words1.forEach(word => {
        wordFreq1[word] = (wordFreq1[word] || 0) + 1;
    });
    
    words2.forEach(word => {
        wordFreq2[word] = (wordFreq2[word] || 0) + 1;
    });

    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;

    const allWords = new Set([...Object.keys(wordFreq1), ...Object.keys(wordFreq2)]);
    
    for (const word of allWords) {
        const freq1 = wordFreq1[word] || 0;
        const freq2 = wordFreq2[word] || 0;
        
        dotProduct += freq1 * freq2;
        magnitude1 += freq1 * freq1;
        magnitude2 += freq2 * freq2;
    }

    const cosineSimilarity = dotProduct / (Math.sqrt(magnitude1) * Math.sqrt(magnitude2) || 1);

    console.log('Cosine Similarity Debug:', {
        dotProduct,
        magnitude1: Math.sqrt(magnitude1),
        magnitude2: Math.sqrt(magnitude2),
        cosineSimilarity
    });

    // Levenshtein-based text similarity with more robust calculation
    const levenshteinDistance = calculateLevenshteinDistance(cleanedText1, cleanedText2);
    const maxLength = Math.max(cleanedText1.length, cleanedText2.length);
    const levenshteinSimilarity = maxLength > 0 
        ? 1 - (levenshteinDistance / maxLength) 
        : 0;

    console.log('Levenshtein Similarity Debug:', {
        levenshteinDistance,
        maxLength,
        levenshteinSimilarity
    });

    // Combine different similarity metrics with weighted approach
    const combinedSimilarity = (
        (jaccardSimilarity * 0.4) +  // Give more weight to Jaccard
        (cosineSimilarity * 0.4) +   // Give more weight to Cosine
        (levenshteinSimilarity * 0.2)  // Less weight to Levenshtein
    );

    console.log('Combined Similarity Debug:', {
        jaccardWeight: jaccardSimilarity * 0.4,
        cosineWeight: cosineSimilarity * 0.4,
        levenshteinWeight: levenshteinSimilarity * 0.2,
        combinedSimilarity
    });

    // Detailed word matches
    const wordMatchDetails = words1.map(word => ({
        word, 
        matchScore: uniqueWords2.has(word) ? 1 : 0
    }));

    // Enhanced line matching with more detailed scoring
    const lines1 = text1.split('\n');
    const lines2 = text2.split('\n');
    
    const lineMatchDetails = lines1.map(line => {
        const cleanLine = cleanText(line);
        const bestMatch = lines2.reduce((best, compareLine) => {
            const lineSimilarity = calculateLineSimilarity(cleanLine, cleanText(compareLine));
            return lineSimilarity > best.score 
                ? { line: compareLine, score: lineSimilarity } 
                : best;
        }, { line: '', score: 0 });

        return {
            originalLine: line,
            bestMatch: bestMatch.line,
            matchScore: bestMatch.score
        };
    });

    // Final detailed similarity result
    const result = {
        overallSimilarity: combinedSimilarity,
        jaccardSimilarity,
        cosineSimilarity,
        levenshteinSimilarity,
        wordMatches: wordMatchDetails,
        lineMatches: lineMatchDetails
    };

    console.log('Final Similarity Result:', result);

    return result;
}

function calculateLevenshteinDistance(str1, str2) {
    const m = str1.length;
    const n = str2.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) {
        for (let j = 0; j <= n; j++) {
            if (i === 0) {
                dp[i][j] = j;
            } else if (j === 0) {
                dp[i][j] = i;
            } else if (str1[i - 1] === str2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = 1 + Math.min(
                    dp[i - 1][j],      // Delete
                    dp[i][j - 1],      // Insert
                    dp[i - 1][j - 1]   // Replace
                );
            }
        }
    }

    return dp[m][n];
}

function calculateLineSimilarity(line1, line2) {
    // Levenshtein distance for line similarity
    const matrix = Array(line1.length + 1).fill(null).map(() => Array(line2.length + 1).fill(null));
    
    for (let i = 0; i <= line1.length; i++) {
        matrix[i][0] = i;
    }
    
    for (let j = 0; j <= line2.length; j++) {
        matrix[0][j] = j;
    }
    
    for (let i = 1; i <= line1.length; i++) {
        for (let j = 1; j <= line2.length; j++) {
            const cost = line1[i - 1] === line2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,     // Deletion
                matrix[i][j - 1] + 1,     // Insertion
                matrix[i - 1][j - 1] + cost  // Substitution
            );
        }
    }
    
    const distance = matrix[line1.length][line2.length];
    const maxLength = Math.max(line1.length, line2.length);
    
    // Convert distance to similarity score (0-1 range)
    return 1 - (distance / maxLength);
}

// Comparison endpoint
app.post('/api/compare', authenticate, async (req, res) => {
    const requestId = req.requestId; // Use the requestId from middleware
    try {
        const { text, threshold = 0.5 } = req.body;

        // Validate input
        if (!text) {
            return res.status(400).json({ error: 'Comparison text is required' });
        }

        const userId = req.user.id; // Get user ID from the authenticated request
        const users = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'users.json')));
        const user = users.find(u => u.id === userId);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Safely read documents with error handling
        let documents = [];
        try {
            const documentsPath = path.join(__dirname, 'data', 'documents.json');
            if (fs.existsSync(documentsPath)) {
                const rawData = fs.readFileSync(documentsPath, 'utf8');
                if (rawData) {
                    documents = JSON.parse(rawData);
                    console.log(`[${requestId}] Read ${documents.length} documents from file`);
                }
            } else {
                console.log(`[${requestId}] Documents file does not exist`);
            }
        } catch (readError) {
            console.error(`[${requestId}] Error reading documents:`, readError);
            return res.status(500).json({ error: 'Failed to read documents' });
        }
        
        // Filter for user's documents
        const userDocuments = documents.filter(doc => doc.userId === userId && doc.content);
        
        console.log(`[${requestId}] Found ${userDocuments.length} documents for user`);
        
        if (userDocuments.length === 0) {
            return res.status(200).json({
                results: [],
                message: 'No documents found for comparison'
            });
        }
        
        const results = [];
        
        for (const doc of userDocuments) {
            const levenshteinDistance = calculateLevenshteinDistance(text, doc.content);
            const maxLength = Math.max(text.length, doc.content.length);
            // Calculate similarity percentage and ensure it is capped at 100%
            const similarityPercentage = maxLength > 0 ? Math.min((1 - (levenshteinDistance / maxLength)) * 100, 100) : 0;

            results.push({
                id: doc.id,
                name: doc.name,
                similarity: similarityPercentage.toFixed(2) // Format to two decimal places
            });
            
            console.log(`[${requestId}] Compared with document: ${doc.name}, Similarity: ${similarityPercentage.toFixed(2)}%`);
        }
        
        // After comparison, return the results along with updated credits
        res.json({
            results: results,
            credits: user.credits // Return the updated credits
        });
    } catch (error) {
        console.error(`[${requestId}] Error processing comparison:`, error);
        return res.status(500).json({ error: 'Failed to process comparison' });
    }
});

// Similarity calculation utility functions
function calculateJaccardSimilarity(text1, text2) {
  if (!text1 || !text2) return 0;
  
  const words1 = new Set(text1.toLowerCase().split(/\W+/).filter(w => w.length > 1));
  const words2 = new Set(text2.toLowerCase().split(/\W+/).filter(w => w.length > 1));
  
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

function calculateLevenshteinSimilarity(text1, text2) {
  const distance = levenshtein.get(text1, text2);
  const maxLength = Math.max(text1.length, text2.length);
  return 1 - (distance / maxLength);
}

function calculateCosineSimilarity(text1, text2) {
  const words1 = text1.toLowerCase().split(/\W+/).filter(w => w.length > 1);
  const words2 = text2.toLowerCase().split(/\W+/).filter(w => w.length > 1);
  
  const wordFreq1 = {};
  const wordFreq2 = {};
  
  words1.forEach(word => {
    wordFreq1[word] = (wordFreq1[word] || 0) + 1;
  });
  
  words2.forEach(word => {
    wordFreq2[word] = (wordFreq2[word] || 0) + 1;
  });
  
  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;
  
  const allWords = new Set([...Object.keys(wordFreq1), ...Object.keys(wordFreq2)]);
  
  for (const word of allWords) {
    const freq1 = wordFreq1[word] || 0;
    const freq2 = wordFreq2[word] || 0;
    
    dotProduct += freq1 * freq2;
    magnitude1 += freq1 * freq1;
    magnitude2 += freq2 * freq2;
  }
  
  return dotProduct / (Math.sqrt(magnitude1) * Math.sqrt(magnitude2) || 1);
}

// PDF Comparison Endpoint
app.post('/api/compare/pdfs', authenticate, async (req, res) => {
    try {
        const { documentIds } = req.body;
        const userId = req.user ? req.user.id : req.session.user.id;

        if (!documentIds || !Array.isArray(documentIds) || documentIds.length < 2) {
            return res.status(400).json({ error: 'At least two document IDs are required' });
        }

        // Fetch documents with type filter for PDFs
        const documents = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'documents.json')));
        const userDocuments = documents.filter(doc => doc.userId === userId && doc.id === documentIds[0]);

        if (userDocuments.length < 1) {
            return res.status(404).json({ error: 'Not enough PDF documents found' });
        }

        // Compare PDFs
        const pdfComparisons = [];
        for (let i = 0; i < userDocuments.length; i++) {
            for (let j = i + 1; j < userDocuments.length; j++) {
                const pdf1 = userDocuments[i];
                const pdf2 = userDocuments[j];

                const detailedSimilarity = calculateDetailedSimilarity(pdf1.content, pdf2.content);

                pdfComparisons.push({
                    document1: { id: pdf1.id, name: pdf1.name },
                    document2: { id: pdf2.id, name: pdf2.name },
                    similarity: detailedSimilarity.overallSimilarity,
                    wordMatches: detailedSimilarity.wordMatches,
                    lineMatches: detailedSimilarity.lineMatches
                });
            }
        }

        res.json({
            pdfComparisons,
            totalComparisonsMade: pdfComparisons.length
        });
    } catch (error) {
        console.error('PDF Comparison Error:', error);
        res.status(500).json({ error: 'Failed to compare PDFs' });
    }
});

// Logout endpoint
// Improved logout endpoint
app.get('/api/logout', (req, res) => {
  // Properly destroy the session
  if (req.session) {
    // Get the user information before destroying the session
    const userId = req.session.user ? req.session.user.id : null;
    
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destruction error:', err);
        return res.status(500).json({ success: false, error: 'Failed to destroy session' });
      }
      
      // If user was authenticated with a token, also remove the token from sessions.json
      if (userId && req.headers.authorization) {
        try {
          const sessionsPath = path.join(__dirname, 'data', 'sessions.json');
          const sessions = JSON.parse(fs.readFileSync(sessionsPath));
          const updatedSessions = sessions.filter(s => 
            !(s.user && s.user.id === userId && s.token === req.headers.authorization)
          );
          fs.writeFileSync(sessionsPath, JSON.stringify(updatedSessions, null, 2));
        } catch (err) {
          console.error('Error removing session token:', err);
        }
      }
      
      // Clear the cookie
      res.clearCookie('connect.sid');
      
      // Return success response
      res.json({ success: true });
    });
  } else {
    res.json({ success: true });
  }
});

// Final error handling middleware
app.use((err, req, res, next) => {
    console.error('FINAL ERROR HANDLER:', {
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
        error: {
            name: err.name,
            message: err.message,
            stack: err.stack
        }
    });

    res.status(500).json({
        error: 'Server encountered an unexpected error',
        requestId: req.requestId
    });
});

// Graceful shutdown handler
process.on('uncaughtException', (error) => {
    console.error('UNCAUGHT EXCEPTION:', {
        timestamp: new Date().toISOString(),
        error: {
            name: error.name,
            message: error.message,
            stack: error.stack
        }
    });
    
    // Optional: Attempt to restart the server or log to a file
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION:', {
        timestamp: new Date().toISOString(),
        reason: reason,
        promise: promise
    });
});

app.listen(PORT, 'localhost', () => {
  console.error(`Server running on http://localhost:${PORT}`);
});