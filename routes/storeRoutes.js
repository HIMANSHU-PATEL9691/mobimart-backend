const express = require("express");
const storeController = require("../controllers/storeController");

const router = express.Router();

router.get("/health", storeController.getHealth);
router.get("/store", storeController.getStore);
router.post("/products", storeController.upload.array("images", 3), storeController.createProduct);
router.post("/products/bulk-upload", storeController.uploadExcel.single("file"), storeController.bulkCreateProducts);
router.put("/products/:id", storeController.upload.array("images", 3), storeController.updateProduct);

router.delete("/products/:id", storeController.deleteProduct);
router.post("/orders", storeController.createOrder);
router.patch("/orders/:id/status", storeController.updateOrderStatus);
router.post("/customers/login", storeController.loginCustomer);
router.post("/customers", storeController.createCustomer);
router.patch("/customers/:id/status", storeController.updateCustomerStatus);
router.delete("/customers/:id", storeController.deleteCustomer);

module.exports = router;
