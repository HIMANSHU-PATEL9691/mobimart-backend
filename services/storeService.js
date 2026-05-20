const crypto = require("crypto");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Customer = require("../models/Customer");

const hashPassword = (password) =>
  crypto.createHash("sha256").update(password).digest("hex");

const upsertCustomerFromOrder = async (order) => {
  const email = order.customerEmail.trim().toLowerCase();
  const existing = await Customer.findOne({ email }).exec();

  if (!existing) {
    const customer = new Customer({
      name: order.customerName,
      email,
      phone: order.customerPhone,
      totalOrders: 1,
      totalSpent: order.totalAmount,
      status: "active", // Orders automatically activate customers
      joinedAt: new Date().toISOString().slice(0, 10),
    });
    return customer.save();
  }

  existing.name = order.customerName;
  existing.phone = order.customerPhone;
  existing.totalOrders += 1;
  existing.totalSpent += order.totalAmount;
  return existing.save();
};

const toPlain = (doc) => (doc ? doc.toObject({ virtuals: true }) : null);
const toPlainArray = (docs) => docs.map((doc) => toPlain(doc));

exports.getStore = async () => {
  const products = await Product.find().exec();
  const orders = await Order.find().sort({ createdAt: -1 }).exec();
  const customers = await Customer.find().exec();
  return {
    products: toPlainArray(products),
    orders: toPlainArray(orders),
    customers: toPlainArray(customers),
  };
};

exports.findProductByName = async (productName) => {
  const product = await Product.findOne({ name: productName }).exec();
  return toPlain(product);
};

exports.createProduct = async (payload) => {
  const product = new Product(payload);
  const savedProduct = await product.save();
  return toPlain(savedProduct);
};

exports.updateProduct = async (productId, payload) => {
  const updated = await Product.findByIdAndUpdate(productId, payload, { returnDocument: 'after' }).exec();
  return toPlain(updated);
};

exports.deleteProduct = async (productId) => {
  const result = await Product.findByIdAndDelete(productId).exec();
  return Boolean(result);
};

exports.createOrder = async (payload) => {
  const order = new Order({
    customerName: payload.customerName,
    customerEmail: payload.customerEmail.trim().toLowerCase(),
    customerPhone: payload.customerPhone,
    items: payload.items,
    totalAmount: payload.totalAmount,
    status: "pending",
    paymentMethod: payload.paymentMethod,
    address: payload.address,
    createdAt: new Date(),
  });

  const savedOrder = await order.save();
  await upsertCustomerFromOrder(savedOrder);
  return savedOrder.toObject();
};

exports.updateOrderStatus = async (orderId, status) => {
  const updated = await Order.findByIdAndUpdate(orderId, { status }, { returnDocument: 'after' }).exec();
  return toPlain(updated);
};

exports.createCustomer = async (payload) => {
  const customer = new Customer({
    name: payload.name,
    email: payload.email.trim().toLowerCase(),
    phone: payload.phone,
    password: payload.password ? hashPassword(payload.password) : undefined,
    totalOrders: 0,
    totalSpent: 0,
    status: "pending",
    joinedAt: new Date().toISOString().slice(0, 10),
  });
  const savedCustomer = await customer.save();
  return toPlain(savedCustomer);
};

exports.loginCustomer = async (email, password) => {
  const hashed = hashPassword(password);
  const customer = await Customer.findOne({ email: email.trim().toLowerCase(), password: hashed }).exec();
  return toPlain(customer);
};

exports.updateCustomerStatus = async (customerId, status) => {
  const updated = await Customer.findByIdAndUpdate(customerId, { status }, { returnDocument: 'after' }).exec();
  return toPlain(updated);
};

exports.deleteCustomer = async (customerId) => {
  const result = await Customer.findByIdAndDelete(customerId).exec();
  return Boolean(result);
};
