const express = require("express");
const axios = require("axios");
const redis = require("redis");

const app = express();
const port = process.env.PORT || 3000;

//IIFE (Immediately Invoked Function Expression) returning back a Singleton redis instance
const Singleton = (function () {
  let redisInstance;

  async function createInstance() {
    redisInstance = redis.createClient();

    redisInstance.on("error", (error) => console.error(`Error : ${error}`));

    await redisInstance.connect();
    return redisInstance;
  }

  return {
    getInstance: async function () {
      if (!redisInstance) {
        redisInstance = await createInstance();
      }
      return redisInstance;
    },
  };
})();

//Fetch the redis client as a Singleton instance
let redisClient;
Singleton.getInstance()
  .then(function (instance) {
    redisClient = instance;
  })
  .catch(function (error) {
    console.error(error);
  });

//Fetch the API Response
async function fetchApiData(species) {
  const apiResponse = await axios.get(
    `https://www.fishwatch.gov/api/species/${species}`
  );
  console.log("Request sent to the API");
  return apiResponse.data;
}

//Fetch the data from Redis Cache
async function getCacheData(req, res, next) {
  const species = req.params.species;
  let results;
  try {
    const cacheResults = await redisClient.get(species);
    if (cacheResults) {
      results = JSON.parse(cacheResults);
      res.send({
        fromCache: true,
        data: results,
      });
    } else {
      next();
    }
  } catch (error) {
    console.error(error);
    res.status(404);
  }
}

//Fetch the data from API and store it in Redis Cache
async function getSpeciesData(req, res) {
  const species = req.params.species;
  let results;

  try {
    results = await fetchApiData(species);
    if (results.length === 0) {
      throw "API returned an empty array";
    }
    await redisClient.set(species, JSON.stringify(results), {
      EX: 180,
      NX: true,
    });

    res.send({
      fromCache: false,
      data: results,
    });
  } catch (error) {
    console.error(error);
    res.status(404).send("Data unavailable");
  }
}

//Add the middleware to check for the cached Redis data
app.get("/fish/:species", getCacheData, getSpeciesData);

//Application listens on a port
app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
