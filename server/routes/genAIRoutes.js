const express = require('express');
const router = express.Router();
const genAIController = require('../controllers/genAIController');

router.post('/enhance-image', genAIController.enhanceImage);

router.post('/generate', genAIController.generateCode);

module.exports = router;