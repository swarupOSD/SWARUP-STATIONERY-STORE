require('dotenv').config();
const required = [];
function env(name, fallback = '') {
  return process.env[name] ?? fallback;
}
module.exports = {
  NODE_ENV: env('NODE_ENV', 'development'),
  PORT: parseInt(env('PORT', '5000'), 10),
  MONGO_URI: env('MONGO_URI', 'mongodb://127.0.0.1:27017/swarup-store'),
  JWT_SECRET: env('JWT_SECRET', 'dev-secret-change-me-min-32-chars!!!!'),
  JWT_EXPIRES_IN: env('JWT_EXPIRES_IN', '7d'),
  CLIENT_ORIGIN: env('CLIENT_ORIGIN', 'http://localhost:5173'),
  ADMIN_USERNAME: env('ADMIN_USERNAME', 'admin'),
  ADMIN_PASSWORD: env('ADMIN_PASSWORD', ''),
  ADMIN_NAME: env('ADMIN_NAME', 'Admin'),
  GEMINI_API_KEY: env('GEMINI_API_KEY', ''),
  CLOUDINARY_CLOUD_NAME: env('CLOUDINARY_CLOUD_NAME', ''),
  CLOUDINARY_API_KEY: env('CLOUDINARY_API_KEY', ''),
  CLOUDINARY_API_SECRET: env('CLOUDINARY_API_SECRET', ''),
};
