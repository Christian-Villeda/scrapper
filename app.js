const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const moment = require('moment');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const app = express();
const port = 8081; // Puerto del servidor

// Definimos la ruta para la API REST
app.get('/Asin', async (req, res) => {
  try {
    const { url } = req.query;
    let result = '';

    if (!url) {
      return res.status(400).json({ error: 'Falta el parámetro URL.' });
    }

    // Validar si ya se consultó el ASIN el día de hoy
    const timestamp = moment().format('YYYY-MM-DD');
    const foundFile = await findFileBySuffix(timestamp, url);
    let cacheExpired = true;
    let response = null;

    if (foundFile) {
      console.log(`Se encontró el archivo: ${foundFile.fileName}`);
      console.log(`Cache expirado ${foundFile.ExpiredCache}`);
      cacheExpired = foundFile.ExpiredCache;

      if (cacheExpired === false) {
        console.log('El cache no ha expirado');

        // Leer el contenido del archivo
        const filePath = foundFile.fileName;
        const pageHTML = await readLogFile(filePath);

        if (pageHTML) {
          console.log('Se leyó el archivo:', filePath);
          // Obtener el html de la página con formato JSON
          response = await ObtenerDatos(pageHTML);
        }
      }
    }

    // Si response es diferente de null, significa que se encontró la respuesta deseada, por lo que no se ejecutará el resto del código.
    if (response !== null) {
      console.log('Respuesta encontrada:', response);
      result = response;
    } else {
      // Código restante que se ejecutará si no se encontró la respuesta deseada o si ocurrió algún otro escenario.
      result = await scrapeProductData(url);
    }

    // Devolver el resultado como respuesta de la API formateado
    return res.json(result, null, 2);
  } catch (error) {
    console.error('Error en la API REST:', error);
    return res.status(500).json({ error: 'Ocurrió un error en el servidor.' });
  }
});


// Función para realizar el web scraping con comportamiento Humano
async function scrapeProductData(url) {
  try {
    let captura = 0;
    const timestamp = moment().format('YYYY-MM-DD');
    const bucketImage = `capturas/${timestamp}`;
    const CodigoPostal = '33142';
    const urlMin = `https://www.amazon.com/dp/${url}?th=1&psc=1`;

    console.log(urlMin);

    // Iniciar el navegador Chromium
    const browser = await chromium.launch();
    // Crear una nueva página en el navegador
    const page = await browser.newPage();
    // Navegar a una URL
    await page.goto(urlMin);

    // Tomar una captura de pantalla de toda la página y guardarla en un archivo
    // await page.screenshot({ path: `${bucketImage}/${url}_${captura}.png` });
    captura++;

    // Esperar a que aparezca el selector de direccion y hacer clic en él
    await page.waitForSelector('#glow-ingress-line2');
    await page.click('#glow-ingress-line2');
    console.log('Se hizo clic en direccion');

    // Tomar una captura de pantalla de toda la página y guardarla en un archivo
    // await page.screenshot({ path: `${bucketImage}/${url}_${captura}.png` });
    captura++;

    // Esperar a que aparezca el selector #a-popover-1 en donde se coloca el cod postal
    await page.waitForSelector('#GLUXZipUpdateInput'); 
    // // Esperar a que el contenido dentro de #a-popover-1 esté disponible
    // await page.waitForFunction(() => {
    //   const popoverElement = document.querySelector('#a-popover-1');
    //   return popoverElement && popoverElement.textContent.trim() !== '';
    // });

    // // Obtener y imprimir el HTML dentro de #a-popover-1 utilizando page.evaluate
    // const html = await page.evaluate(() => {
    //   const popoverElement = document.querySelector('#a-popover-1');
    //   return popoverElement.innerHTML;
    // });


    // Esperar a que aparezca el selector del elemento
    await page.waitForSelector('#Condo');
    await page.waitForSelector('#GLUXSpecifyLocationDiv > div.a-declarative > span');


    // Tomar una captura de pantalla de toda la página y guardarla en un archivo
    // await page.screenshot({ path: `${bucketImage}/${url}_${captura}.png` });
    captura++;

    // seleccionar el input del codigo postal
    await page.click('#GLUXZipUpdateInput');
    console.log('Se hizo clic en el campo de texto');

    // colocar el codigo postal deseado en el input
    await page.fill('#GLUXZipUpdateInput', CodigoPostal);
    console.log('Se escribio el codigo postal');

    // Tomar una captura de pantalla de toda la página y guardarla en un archivo
    // await page.screenshot({ path: `${bucketImage}/${url}_${captura}.png` });
    captura++;

    //esperar un segundo mintras realiza el evento del cambio del input 
    await page.waitForTimeout(1000);


    // Esperar a que aparezca el selector del elemento select
    // await page.waitForSelector('#GLUXCountryList');
    // // Seleccionar la opción deseada utilizando selectOption()
    // await page.selectOption('#GLUXCountryList', 'Ship outside the US');
    // // Esperar a que aparezca el selector del elemento
    // await page.waitForSelector('#GLUXSpecifyLocationDiv > div.a-declarative > span');
    // // Obtener el elemento usando $()
    // const SelectC1 = await page.$('#GLUXSpecifyLocationDiv > div.a-declarative > span');
    // // Obtener el HTML del elemento usando innerHTML
    // const htmlSelectC1 = await SelectC1.evaluate((el) => el.innerHTML);
    // // Imprimir el HTML del componente en la consola
    // //console.log('select Actual:', htmlSelectC1);


    // Esperar a que aparezca el selector del campo de entrada
    await page.waitForSelector('#GLUXZipUpdateInput');
    // Hacer clic en el campo de entrada
    await page.click('#GLUXZipUpdateInput');
    // Simular un "Enter" en el campo de entrada
    await page.keyboard.press('Enter');

    // Tomar una captura de pantalla de toda la página y guardarla en un archivo
    // await page.screenshot({ path: `${bucketImage}/${url}_${captura}.png` });
    captura++;

    // Esperar a recargar la modal
    //await page.waitForTimeout(1000);

    // Esperar a que aparezca el selector #GLUXHiddenSuccessSelectedAddressPlaceholder y obtener el texto
    await page.waitForSelector('#GLUXHiddenSuccessSelectedAddressPlaceholder');
    const TitlePostal = await page.$eval('#GLUXHiddenSuccessSelectedAddressPlaceholder', el => el.textContent);
    // Imprimir el texto del componente en la consola
    console.log('modal postal:', TitlePostal);

    // Esperar a que aparezca el selector #GLUXHiddenSuccessSubTextAisEgress y obtener el texto
    await page.waitForSelector('#GLUXHiddenSuccessSubTextAisEgress');
    const successText = await page.$eval('#GLUXHiddenSuccessSubTextAisEgress', el => el.textContent);
    // Imprimir el texto del componente en la consola
    console.log('mensaje:', successText);

    // Simular la pulsación de la tecla "Enter" en la página
    // await page.screenshot({ path: `${bucketImage}/${url}_${captura}.png` });
    captura++;

    await page.keyboard.press('Enter');
    console.log('Se presiono enter');

    // se debe esperar a que cargue la pagina con el nuevo postal
    await page.waitForNavigation();


    // imprimir nueva direccion de envio
    await page.waitForSelector('#glow-ingress-line2');
    let deliverTo = await page.$eval('#glow-ingress-line2', el => el.textContent);
    // Imprimir el texto del componente en la consola
    deliverTo = deliverTo.trim();
    console.log('Enviar a:', deliverTo);

    // validar que la direccion sea la correcta
    if (!deliverTo.includes('Miami')) {
      let response = {
        error: 'La dirección no es la correcta.'
      };

      console.log(JSON.stringify(response));
      return response;
    }

    // Tomar una captura de pantalla de toda la página y guardarla en un archivo
    // await page.screenshot({ path: `${bucketImage}/${url}_${captura}.png` });
    captura++;


    // guardar el html generado
    const pageHTML = await page.content();
    // obtener el html de la pagina con formato JSON
    let response = ObtenerDatos(pageHTML);
    // guardar el log del html generado
    logToFile(pageHTML, url)

    // Cerrar el navegador
    await browser.close();

    // Devolver el resultado como respuesta de la API formateado sin las barras invertidas
    return response;

  } catch (error) {
    console.error('Error al realizar el web scraping:', error);
  }

}

//
function ObtenerDatos(html) {
  let text = html.toString();
  const $ = cheerio.load(html);
  const result = {}; // Objeto para almacenar los resultados del scrapper

  const imageUrls = [];
  let title = '';
  let category = '';
  let terms = '';
  let description = '';
  let price = '';
  let priceFirst = '';
  let precioAmazon = '';
  let ASIN = '';
  const currentTime = moment().format('HH:mm');
  const currentDate = moment().locale('es').format('D [de] MMMM [del] YYYY [a las] HH:mm');

  switch (true) {
    case html.trim() !== '':

      // Buscar las etiquetas de imagen que contengan la cadena "/images/I"

      // $('img').each((index, element) => {
      //   const imageUrl = $(element).attr('src');
      //   if (imageUrl.includes('/images/I')) {
      //     imageUrls.push(imageUrl);
      //   }
      // });


      //obtener el ASIN 
      // Buscar el elemento <th> que contiene el texto "ASIN" y obtener el siguiente elemento <td>
      var asinElement = $('th.a-color-secondary:contains("ASIN")');
      var tdElement = asinElement.next('td');

      // Obtener el texto del elemento <td>
      var asinValue = tdElement.text().trim();

      if (asinValue.trim() == '') {
        // Buscar el elemento 'th' que contiene el nombre "ASIN"
        const thElement = $('th:contains("ASIN")');
        // Obtener el texto del elemento 'td' que le sigue
        const tdElement = thElement.next().text().trim();
        asinValue = tdElement;
      }
      if (asinValue.trim() == '') {
    // Encontrar el elemento que contiene el valor del ASIN
      const asinElement = $('span.a-text-bold:contains("ASIN")').next('span');
    // Obtener el valor del ASIN
      asinValue = asinElement.text().trim();

      }

      // Encuentra los elementos en el HTML y extrae la información deseada
      title = $('#productTitle').text().trim();
      description = $('#feature-bullets').text().trim();
      priceFirst = $('#corePrice_feature_div > div > span.a-price.aok-align-center > span.a-offscreen').text().trim();
      if (priceFirst.trim() == '') {
        priceFirst = $('#corePriceDisplay_desktop_feature_div > div.a-section.a-spacing-none.aok-align-center > span.a-price.aok-align-center.reinventPricePriceToPayMargin.priceToPay > span.a-offscreen').text().trim();
      }
      priceFirst = cleanPrice(priceFirst); // Limpia el precio 
      ASIN = asinValue;

      break;


    default:
      description = "sin datos";
      price = "sin datos";
      priceFirst = "sin datos";
  }



  // agrega la información al objeto result
  result.url = `https://www.amazon.com/dp/${ASIN}?th=1&psc=1`;
  result.titulo = title;
  result.descripcion = description;
  result.precioAmazon = priceFirst;
  result.hora = currentTime;
  result.fecha = currentDate;
  result.ASIN = ASIN;
  // agrega el objeto imageUrls al objeto result
  //result.imagenes = imageUrls;



  return result;

}

// funcion para validar si existe el log 
async function findFileBySuffix(dateFolder, fileNameSuffix) {
  const folderPath = path.join('logs', dateFolder);

  try {
    // Leer los nombres de archivo en la carpeta
    const fileNames = fs.readdirSync(folderPath);

    // Filtrar los nombres de archivo que contienen el sufijo buscado
    const matchingFiles = fileNames.filter((fileName) => fileName.includes(fileNameSuffix));

    // Ordenar los nombres de archivo alfabéticamente en orden descendente
    matchingFiles.sort((a, b) => b.localeCompare(a));

    if (matchingFiles.length > 0) {
      // Obtener el nombre del primer archivo encontrado
      const foundFile = matchingFiles[0];

      // Obtener la parte de la hora del nombre del archivo (ejemplo: "17-28")
      const fileTime = foundFile.split('_')[1].replace('.txt', '');
      console.log('fileTime:', fileTime);

      // Obtener la hora actual en el mismo formato que el nombre del archivo
      const currentTime = moment().format('HH-mm');
      console.log('currentTime:', currentTime);

      // Calcular la diferencia de horas entre el archivo y la hora actual
      const diffHours = Math.abs(moment(fileTime, 'HH-mm').diff(moment(currentTime, 'HH-mm'), 'hours'));
      console.log('diffHours:', diffHours);

      // Determinar si la diferencia es mayor o igual a 1 hora
      const ExpiredCache = diffHours >= 1;

      return { fileName: 'logs/' + dateFolder + '/' + foundFile, ExpiredCache };
    } else {
      return null; // No se encontró ningún archivo que coincida
    }

  } catch (err) {
    return null; // Error al leer la carpeta o no existe
  }
}



// funcion para leer el archivo del log 
function readLogFile(filePath) {
  try {
    const pageHTML = fs.readFileSync(filePath, 'utf8');
    return pageHTML;
  } catch (error) {
    console.error('Error al leer el archivo:', error);
    return null;
  }
}

// Función para limpiar el precio y eliminar el símbolo "Q" y las comas ","
function cleanPrice(price) {

  const pricePattern = /\$\d+(\.\d{2})?/; // Expresión regular para encontrar el precio
  const match = price.match(pricePattern);

  if (match) {
    const price2 = match[0];
    price = price2;
  } else {
    price = 0;
  }

  return price;
}


// Función para redirigir la salida a un archivo de texto
function logToFile(text, name) {
  const timestamp = moment().format('YYYY-MM-DD_HH-mm');
  const fecha = moment().format('YYYY-MM-DD');
  const directoryPath = `logs/${fecha}`;
  const filePath = `${directoryPath}/${timestamp}_${name}.txt`;
  const logMessage = `${text}\n`;

  // Crear el directorio si no existe
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { recursive: true });
  }

  fs.appendFile(filePath, logMessage, (err) => {
    if (err) {
      console.error('Error al escribir en el archivo:', err);
    } else {
      console.log('Registro guardado en el archivo:', filePath);
    }
  });
}


// Iniciamos el servidor
app.listen(port, () => {
  console.log(`Servidor API REST escuchando en http://localhost:${port}`);
});
