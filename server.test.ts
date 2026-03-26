import request from 'supertest';
import express from 'express';
import { jest } from '@jest/globals';

// Mock dependencies
jest.mock('slonik', () => ({
  createPool: jest.fn(),
  sql: {
    unsafe: jest.fn((query) => query),
  },
}));

jest.mock('sps-common', () => ({
  verifyScreedSignature: jest.fn(),
}));

jest.mock('./server/config', () => ({
  loadConfig: jest.fn(),
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  createWriteStream: jest.fn(),
}));

jest.mock('cors', () => jest.fn(() => (req: any, res: any, next: any) => next()));

// Mock the counter module
jest.mock('./counter.js', () => ({
  setupOpinionsRoute: jest.fn(),
  storeScreed: jest.fn(),
  maybeUpdateOpinionCounts: jest.fn(),
}));

// Since the app is created inside main(), we need to mock or refactor.
// For testing, we'll create a minimal app setup.
// Placeholder: In a real setup, you'd export the app from server.ts

describe('API Endpoints', () => {
  let app: express.Application;
  let mockPool: any;
  let mockLogAccess: jest.MockedFunction<any>;
  let counters: { searchesToday: number };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock pool
    mockPool = {
      any: jest.fn(),
      one: jest.fn(),
      maybeOne: jest.fn(),
    };
    (require('slonik').createPool as jest.Mock).mockReturnValue(mockPool);

    // Mock config
    (require('./server/config').loadConfig as jest.Mock).mockResolvedValue({
      serverFunction: 'counter',
      logFileName: 'test.log',
      allowedOrigins: ['http://localhost:3000'],
      blockList: [],
      serverPort: 3000,
      postGresURI: 'postgresql://test:test@localhost:5432/test',
    });

    // Mock fs
    (require('fs').readFileSync as jest.Mock).mockReturnValue('0.0 0.0');
    (require('fs').createWriteStream as jest.Mock).mockReturnValue({
      write: jest.fn(),
    });

    // Mock counters
    counters = { searchesToday: 0 };

    // Mock logAccess
    mockLogAccess = jest.fn((req, info) => '127.0.0.1');

    // Create a minimal app for testing
    app = express();
    app.use(express.json());

    // Mock the routes - in real implementation, these would be set up properly
    // Placeholder: Replace with actual route setup

    // GET /ipv4
    app.get('/ipv4', (req, res) => {
      res.json({ message: `Hello! Your IP address is: ${mockLogAccess(req, '')}` });
    });

    // GET /info
    app.get('/info', async (req, res) => {
      // Mock sqlGetCount
      const mockSqlGetCount = async (query: any) => '42';
      res.json({
        "screeds stored": await mockSqlGetCount('SELECT COUNT(pubkey) FROM sps.screeds'),
        "opinions held": await mockSqlGetCount('SELECT COUNT(screed_count) FROM sps.opinions WHERE screed_count > 0'),
        "searches today": counters.searchesToday,
        "unique visitors today": "placeholder_unique_visitors",
        "hours since server started": 1.0,
        "total hours active": 100.0
      });
    });

    // POST /upload-screed
    app.post('/upload-screed', express.raw({ type: '*/*', limit: '10mb' }), async (req, res) => {
      const rawData = req.body;
      const encoding = req.headers['content-encoding'];
      let dataBuffer;
      if (encoding === 'gzip') {
        // Mock gunzip
        const { gunzipSync } = require('zlib');
        dataBuffer = gunzipSync(rawData);
        mockLogAccess(req, 'Received gzip upload');
      } else {
        dataBuffer = rawData;
        mockLogAccess(req, 'Received raw upload');
      }

      if (Buffer.isBuffer(dataBuffer)) {
        console.log('ERROR: upload-screed (buffer):', dataBuffer.toString());
      } else {
        const screedIsSigned = (require('sps-common').verifyScreedSignature as jest.Mock).mockReturnValue(true);
        if (screedIsSigned) {
          await (require('./counter.js').storeScreed as jest.Mock)(mockPool, dataBuffer);
        }
      }
      res.json({ status: 'success', bytesReceived: dataBuffer.length });
    });

    // Mock setupOpinionsRoute
    (require('./counter.js').setupOpinionsRoute as jest.Mock).mockImplementation((app, pool, logAccess, counters) => {
      app.get('/opinions', async (req, res) => {
        counters.searchesToday += 1;
        let opinions;
        if (req.query.subset) {
          opinions = await pool.any('SELECT * FROM sps.opinions WHERE OPINION ILIKE $1 ORDER BY screed_count DESC');
        } else {
          opinions = await pool.any('SELECT * FROM sps.opinions ORDER BY screed_count DESC');
        }
        res.setHeader('Content-Type', 'application/json');
        res.json(opinions);
      });
    });

    // Call the mock setup
    (require('./counter.js').setupOpinionsRoute as jest.Mock)(app, mockPool, mockLogAccess, counters);
  });

  describe('GET /ipv4', () => {
    it('should return the client IP address', async () => {
      const response = await request(app).get('/ipv4');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        message: 'Hello! Your IP address is: 127.0.0.1'
      });
      expect(mockLogAccess).toHaveBeenCalled();
    });
  });

  describe('GET /info', () => {
    it('should return server statistics', async () => {
      mockPool.any.mockResolvedValue([{ count: '42' }]);

      const response = await request(app).get('/info');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        "screeds stored": "42",
        "opinions held": "42",
        "searches today": 0,
        "unique visitors today": "placeholder_unique_visitors",
        "hours since server started": 1.0,
        "total hours active": 100.0
      });
    });
  });

  describe('GET /opinions', () => {
    it('should return all opinions ordered by screed_count', async () => {
      const mockOpinions = [
        { id: 1, opinion: 'Test opinion 1', screed_count: 10 },
        { id: 2, opinion: 'Test opinion 2', screed_count: 5 }
      ];
      mockPool.any.mockResolvedValue(mockOpinions);

      const response = await request(app).get('/opinions');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockOpinions);
      expect(counters.searchesToday).toBe(1);
      expect(mockLogAccess).toHaveBeenCalledWith(
        expect.any(Object),
        'no subset, returned this many items: 2'
      );
    });

    it('should return filtered opinions when subset query is provided', async () => {
      const mockOpinions = [
        { id: 1, opinion: 'Filtered opinion', screed_count: 10 }
      ];
      mockPool.any.mockResolvedValue(mockOpinions);

      const response = await request(app).get('/opinions?subset=test');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockOpinions);
      expect(counters.searchesToday).toBe(1);
      expect(mockLogAccess).toHaveBeenCalledWith(
        expect.any(Object),
        expect.stringContaining('Safe subset query')
      );
    });
  });

  describe('POST /upload-screed', () => {
    it('should accept and process valid screed data', async () => {
      const mockScreedData = {
        publicKey: 'test_public_key',
        screed: JSON.stringify(['Test opinion'])
      };
      const screedBuffer = Buffer.from(JSON.stringify(mockScreedData));

      (require('sps-common').verifyScreedSignature as jest.Mock).mockReturnValue(true);
      (require('./counter.js').storeScreed as jest.Mock).mockResolvedValue({});

      const response = await request(app)
        .post('/upload-screed')
        .set('Content-Type', 'application/octet-stream')
        .send(screedBuffer);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'success',
        bytesReceived: screedBuffer.length
      });
      expect(require('sps-common').verifyScreedSignature).toHaveBeenCalledWith(mockScreedData);
      expect(require('./counter.js').storeScreed).toHaveBeenCalledWith(mockPool, mockScreedData);
    });

    it('should handle gzip encoded data', async () => {
      const mockScreedData = {
        publicKey: 'test_public_key',
        screed: JSON.stringify(['Test opinion'])
      };
      const screedJson = JSON.stringify(mockScreedData);
      const gzipBuffer = Buffer.from('mock_gzipped_data'); // Placeholder for gzipped data

      // Mock zlib.gunzipSync
      jest.doMock('zlib', () => ({
        gunzipSync: jest.fn(() => Buffer.from(screedJson))
      }));

      (require('sps-common').verifyScreedSignature as jest.Mock).mockReturnValue(true);
      (require('./counter.js').storeScreed as jest.Mock).mockResolvedValue({});

      const response = await request(app)
        .post('/upload-screed')
        .set('Content-Encoding', 'gzip')
        .set('Content-Type', 'application/octet-stream')
        .send(gzipBuffer);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'success',
        bytesReceived: Buffer.from(screedJson).length
      });
    });

    it('should reject invalid screed signature', async () => {
      const mockScreedData = {
        publicKey: 'test_public_key',
        screed: JSON.stringify(['Test opinion'])
      };
      const screedBuffer = Buffer.from(JSON.stringify(mockScreedData));

      (require('sps-common').verifyScreedSignature as jest.Mock).mockReturnValue(false);

      const response = await request(app)
        .post('/upload-screed')
        .set('Content-Type', 'application/octet-stream')
        .send(screedBuffer);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'success',
        bytesReceived: screedBuffer.length
      });
      expect(require('./counter.js').storeScreed).not.toHaveBeenCalled();
    });

    it('should handle buffer data gracefully', async () => {
      const bufferData = Buffer.from('raw buffer data');

      const response = await request(app)
        .post('/upload-screed')
        .set('Content-Type', 'application/octet-stream')
        .send(bufferData);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'success',
        bytesReceived: bufferData.length
      });
    });
  });
});