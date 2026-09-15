const { cloudinary, cloudinaryConfigured } = require('../config/cloudinary');
const path = require('path');
const fs = require('fs');

const FOLDERS = {
  products: 'swarup-store/products',
  bills: 'swarup-store/bills',
  invoices: 'swarup-store/invoices',
  qr: 'swarup-store/qr',
  logo: 'swarup-store/logo',
  reports: 'swarup-store/reports',
};

async function uploadBuffer(buffer, folder, filename = 'file') {
  if (cloudinaryConfigured) {
    const res = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ folder, resource_type: 'auto' }, (err, result) => err ? reject(err) : resolve(result));
      stream.end(buffer);
    });
    return { url: res.secure_url, publicId: res.public_id, provider: 'cloudinary' };
  }
  // Local fallback (dev only; documented as non-permanent on Render)
  const dir = path.join(__dirname, '..', '..', 'uploads', folder.replace(/\//g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  const safe = `${Date.now()}-${String(filename).replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
  fs.writeFileSync(path.join(dir, safe), buffer);
  return { url: `/uploads/${folder.replace(/\//g, '-')}/${safe}`, publicId: safe, provider: 'local' };
}

async function cloudinaryStatus() {
  if (!cloudinaryConfigured) return { configured: false, status: 'not-configured' };
  try {
    await cloudinary.api.ping();
    return { configured: true, status: 'connected' };
  } catch (e) {
    return { configured: true, status: 'error', error: 'Cloudinary unreachable' };
  }
}

module.exports = { uploadBuffer, cloudinaryStatus, FOLDERS };
