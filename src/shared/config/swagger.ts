import swaggerJsdoc from "swagger-jsdoc";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Your API",
      version: "1.0.0",
    },
    servers: [
      {
        url: "http://mercora.up.railway.app/api",
      },
    ],
  },

  // 🔥 THIS is the important part
  apis: ["./../../src/modules/**/*.routes.js"],
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
