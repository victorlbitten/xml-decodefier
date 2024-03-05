const fs = require("fs");
const path = require("path");

function copyXmlFiles(basePath) {
  const destinationPath = path.join(__dirname, "public", "files");

  function copyFile(sourcePath, destinationPath) {
    const fileName = path.basename(sourcePath);
    const destinationFilePath = path.join(destinationPath, fileName);

    console.log(`Copying ${sourcePath} to ${destinationFilePath}`);

    fs.copyFileSync(sourcePath, destinationFilePath);
    console.log(`Copied ${sourcePath} to ${destinationFilePath}`);
  }

  function traverseDirectory(directoryPath) {
    console.log("Traversing directory: ", directoryPath);
    const files = fs.readdirSync(directoryPath);

    files.forEach((file) => {
      const filePath = path.join(directoryPath, file);
      const isDirectory = fs.statSync(filePath).isDirectory();

      if (isDirectory) {
        traverseDirectory(filePath);
      } else if (path.extname(filePath) === ".xml") {
        copyFile(filePath, destinationPath);
      }
    });
  }

  traverseDirectory(basePath);
}

// Usage example:
copyXmlFiles("/media/victor/STR-005/");
