const storeService = require("../services/storeService");
const multer = require("multer");
const path = require("path");
const xlsx = require("xlsx");

const sendSuccess = (res, data, status = 200) => res.status(status).json(data);

const parseJsonField = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
};

const parseArrayField = (value) => {
  const parsed = parseJsonField(value);
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed === "string" && parsed.trim() !== "") {
    return parsed.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
};

const normalizeString = (value) => (typeof value === "string" ? value.trim() : "");

exports.uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.mimetype === "application/vnd.ms-excel" ||
      /\.(xlsx|xls)$/i.test(file.originalname)
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only Excel files are allowed"));
    }
  },
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../uploads"));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

exports.upload = multer({ 
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

exports.getHealth = async (req, res, next) => {
  try {
    sendSuccess(res, { status: "ok", date: new Date().toISOString().slice(0, 10) });
  } catch (error) {
    next(error);
  }
};

exports.getStore = async (req, res, next) => {
  try {
    const store = await storeService.getStore();
    sendSuccess(res, store);
  } catch (error) {
    next(error);
  }
};

const parseExcelProductRow = (row) => {
  const price = Number(row.Price ?? row.price ?? 0);
  const imageValues = parseArrayField(row.ImageUrls ?? row.imageUrls ?? row.Images ?? row.images);

  return {
    name: normalizeString(row.Name ?? row.name),
    brand: normalizeString(row.Brand ?? row.brand) || "Unknown",
    price,
    originalPrice: Number(row.OriginalPrice ?? row.originalPrice ?? price),
    condition:
      (normalizeString(row.Condition ?? row.condition) || "new").toLowerCase() === "used"
        ? "used"
        : "new",
    description: normalizeString(row.Description ?? row.description),
    specs: {
      RAM: normalizeString(row.RAM ?? row.ram),
      Storage: normalizeString(row.Storage ?? row.storage),
      Battery: normalizeString(row.Battery ?? row.battery),
    },
    images: imageValues, // Don't set default here, will be handled in bulkCreateProducts
    stock: Number(row.Stock ?? row.stock ?? 0),
    rating: Number(row.Rating ?? row.rating ?? 0),
    reviewCount: Number(row.ReviewCount ?? row.reviewCount ?? 0),
    featured: String(row.Featured ?? row.featured ?? "").toLowerCase() === "true",
    category: normalizeString(row.Category ?? row.category) || "Mid-Range",
  };
};

exports.bulkCreateProducts = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Excel file is required" });
    }

    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });

    if (!rows.length) {
      return res.status(400).json({ message: "Excel file contains no rows" });
    }

    const createdProducts = [];
    const errors = [];

    for (const [index, row] of rows.entries()) {
      const payload = parseExcelProductRow(row);
      if (!payload.name || !payload.brand || !payload.price || !payload.description) {
        errors.push(`Row ${index + 2} missing required product fields`);
        continue;
      }

      // Check if product with same name already exists and reuse its images
      const existingProduct = await storeService.findProductByName(payload.name);
      if (existingProduct && existingProduct.images && existingProduct.images.length > 0) {
        payload.images = existingProduct.images;
      } else if (!payload.images || payload.images.length === 0) {
        // Set default image only if no existing product found and no images in Excel
        payload.images = ["/products/iphone-premium.svg"];
      }

      const product = await storeService.createProduct(payload);
      createdProducts.push(product);
    }

    if (createdProducts.length === 0) {
      return res.status(400).json({ message: "No valid products were found in the Excel file", errors });
    }

    sendSuccess(res, { created: createdProducts, errors }, 201);
  } catch (error) {
    next(error);
  }
};

exports.createProduct = async (req, res, next) => {
  try {
    const imageUrls = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        imageUrls.push(`/uploads/${file.filename}`);
      });
    }

    const payload = {
      ...req.body,
      // Always keep only first 3 images (prevents 4th image from being stored)
      images: [...imageUrls, ...parseArrayField(req.body.images)].slice(0, 3),
      specs: parseJsonField(req.body.specs) || {},
    };

    const product = await storeService.createProduct(payload);
    sendSuccess(res, product, 201);
  } catch (error) {
    next(error);
  }
};

exports.updateProduct = async (req, res, next) => {
  try {
    // Handle uploaded files for updates
    const imageUrls = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        imageUrls.push(`/uploads/${file.filename}`);
      });
    }

    const payload = { ...req.body };
    if (payload.specs) {
      payload.specs = parseJsonField(payload.specs) || {};
    }

    if (imageUrls.length > 0) {
      // If new images are uploaded, replace existing ones
      payload.images = imageUrls.slice(0, 3);
    } else if (payload.images) {
      // If images came from body (e.g. existing ones), ensure max 3
      payload.images = parseArrayField(payload.images).slice(0, 3);
    }

    const updated = await storeService.updateProduct(req.params.id, payload);
    if (!updated) {
      return res.status(404).json({ message: "Product not found" });
    }
    sendSuccess(res, updated);
  } catch (error) {
    next(error);
  }
};

exports.deleteProduct = async (req, res, next) => {
  try {
    const deleted = await storeService.deleteProduct(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Product not found" });
    }
    sendSuccess(res, { success: true });
  } catch (error) {
    next(error);
  }
};

exports.createOrder = async (req, res, next) => {
  try {
    const order = await storeService.createOrder(req.body);
    sendSuccess(res, order, 201);
  } catch (error) {
    next(error);
  }
};

exports.updateOrderStatus = async (req, res, next) => {
  try {
    const updated = await storeService.updateOrderStatus(req.params.id, req.body.status);
    if (!updated) {
      return res.status(404).json({ message: "Order not found" });
    }
    sendSuccess(res, updated);
  } catch (error) {
    next(error);
  }
};

exports.createCustomer = async (req, res, next) => {
  try {
    const customer = await storeService.createCustomer(req.body);
    sendSuccess(res, customer, 201);
  } catch (error) {
    next(error);
  }
};

exports.loginCustomer = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const customer = await storeService.loginCustomer(email, password);
    if (!customer) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    sendSuccess(res, customer);
  } catch (error) {
    next(error);
  }
};

exports.updateCustomerStatus = async (req, res, next) => {
  try {
    const updated = await storeService.updateCustomerStatus(req.params.id, req.body.status);
    if (!updated) {
      return res.status(404).json({ message: "Customer not found" });
    }
    sendSuccess(res, updated);
  } catch (error) {
    next(error);
  }
};

exports.deleteCustomer = async (req, res, next) => {
  try {
    const deleted = await storeService.deleteCustomer(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Customer not found" });
    }
    sendSuccess(res, { success: true });
  } catch (error) {
    next(error);
  }
};
