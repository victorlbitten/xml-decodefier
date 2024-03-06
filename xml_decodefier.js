const fs = require("fs");
const path = require("path");
const { XMLParser } = require("fast-xml-parser");
const moment = require("moment-timezone");

main();

async function main() {
  const folderPath = path.join(__dirname, "public", "files");
  const files = await getXmlFilesInFolder(folderPath);

  const dataBySnvCode = {};

  for (let file of files) {
    const snvCode = path.basename(file, path.extname(file));
    const filePath = path.join(folderPath, file);
    dataBySnvCode[snvCode] = await computeFile(filePath);
  }

  await writeFiles(dataBySnvCode);
}

async function getXmlFilesInFolder(folderPath) {
  const files = await fs.promises.readdir(folderPath);
  return files;
}

async function computeFile(xmlFilePath) {
  console.log("Computing file: ", xmlFilePath);
  const [headerData, entries] = await readXmlFile(xmlFilePath);
  const [entriesData, geopositionData] = generateDataFromAllEntries(entries);
  const assayData = generateAssayData(headerData, entriesData);
  return { assayData, entriesData, geopositionData };
}

async function writeFiles(dataObject) {
  writeGeopositionFile(dataObject);
  writeAssayFile(dataObject);
}

async function readXmlFile(filePath) {
  const parser = createXmlParser();
  const xmlData = await fs.promises.readFile(filePath, "utf-8", (err) => {});
  const jsonData = parser.parse(xmlData);

  const headerData = jsonData["DadosTrecho"]["Trecho"];
  const logsData = jsonData["DadosTrecho"]["Logs"]["Log"];
  return [headerData, logsData];
}

function createXmlParser() {
  const options = {
    ignoreAttributes: false, // Keep attributes in JSON
    parseAttributeValue: true, // Parse attribute values
  };
  return new XMLParser(options);
}

function generateDataFromAllEntries(entries) {
  let entriesMeterStep = 5;
  let currentMeterCount = 0;
  let dataObject = {};
  let geoPositionOnMultipleOf20 = {};
  for (let entry of entries) {
    const currentPosition = parseInt(entry["@_Hodometro"]);
    if (currentPosition === currentMeterCount) {
      const title = parseInt(generateTitleFromPosition(currentPosition));
      const geoPosition = getLatLongFromEntry(entry);
      const temperature = entry["Barometro"]["@_Temp"];
      const altitude = entry["Barometro"]["@_Altitude"];
      const timestamp = entry["@_DataHora"];
      const hodometer = entry["@_Hodometro"];
      dataObject[title] = {
        geoPosition,
        temperature,
        altitude,
        hodometer,
        timestamp,
      };

      if (currentMeterCount % 20 === 0) {
        geoPositionOnMultipleOf20[title] = geoPosition;
      }
      currentMeterCount += entriesMeterStep;
    }
  }
  return [dataObject, geoPositionOnMultipleOf20];
}

function generateTitleFromPosition(position) {
  const padWith = "0";
  const numberOfDigitsOnTitle = 5;

  const title = `${position}`.padStart(numberOfDigitsOnTitle, padWith);
  return title;
}

function getLatLongFromEntry(entry) {
  return {
    lat: entry["GPS"]["@_Y"],
    long: entry["GPS"]["@_X"],
  };
}

function roundToThreeDecimals(number) {
  return parseFloat(number).toFixed(3);
}

function generateAssayData(headerData, entriesData) {
  const firstReading = entriesData[0];

  const numberOfEntries = Object.keys(entriesData).length;
  const lastReadingPosition = (numberOfEntries - 1) * 5;
  const lastReading = entriesData[lastReadingPosition];

  const startKm = firstReading.hodometer / 1000;
  const endKm = lastReading.hodometer / 1000;
  const assayData = {
    name: headerData["NomeTrecho"],
    startKm: roundToThreeDecimals(startKm),
    endKm: roundToThreeDecimals(endKm),
    stretchExtension: roundToThreeDecimals(endKm - startKm),
    vehiclePlate: headerData["Placa"],
    assetType: headerData["IRI"],
    driver: headerData["Operador"],
    geoPositions: {
      start: firstReading.geoPosition,
      end: lastReading.geoPosition,
    },
    timeData: {
      start: formatTimestamp(firstReading.timestamp),
      end: formatTimestamp(lastReading.timestamp),
    },
  };
  return assayData;
}

function formatTimestamp(timestamp) {
  const date = moment(timestamp);
  const formattedDate = date.format("DD/MM/YYYY");
  const formattedTime = date.format("HH:mm:ss");

  return {
    date: formattedDate,
    time: formattedTime,
  };
}

async function writeGeopositionFile(dataObject) {
  const snvCodes = Object.keys(dataObject);
  for (let snvCode of snvCodes) {
    const geoPosition = dataObject[snvCode].geopositionData;
    let csvData = "";
    const headerInfo = `Meterage,Lat,Long\n`;
    Object.keys(geoPosition).forEach((key) => {
      const entry = geoPosition[key];
      const line = `${key},${entry.lat},${entry.long}\n`;
      csvData += line;
    });
    csvData = headerInfo + csvData;
    const filePath = path.join(
      __dirname,
      "public",
      "outputs",
      `${snvCode}_geoposition.csv`
    );
    await fs.promises.writeFile(filePath, csvData);
  }
}

async function writeAssayFile(dataObject) {
  const snvCodes = Object.keys(dataObject);

  let csvData = "";
  const headerInfo = `Name,StartKm,EndKm,StretchExtension,VehiclePlate,AssetType,Driver,StartPosition,EndPosition,Date,StartTime,EndTime\n`;
  csvData += headerInfo;

  for (let snvCode of snvCodes) {
    const assayData = dataObject[snvCode].assayData;
    const startPosition = `${assayData.geoPositions.start.lat},${assayData.geoPositions.start.long}`;
    const endPosition = `${assayData.geoPositions.end.lat},${assayData.geoPositions.end.long}`;
    const line = `${assayData.name},${assayData.startKm},${assayData.endKm},${assayData.stretchExtension},${assayData.vehiclePlate},${assayData.assetType},${assayData.driver},"${startPosition}","${endPosition}",${assayData.timeData.start.date},${assayData.timeData.start.time},${assayData.timeData.end.time}\n`;
    csvData += line;
  }

  const filePath = path.join(__dirname, "public", "outputs", "assay.csv");
  await fs.promises.writeFile(filePath, csvData);
}
