const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const moment = require('moment');
const fs = require('fs');
const path = require('path');
const {
	chromium
} = require('playwright');
const e = require('express');
const cors = require('cors');

const app = express();
const port = 8081; // Puerto del servidor
// Habilitar CORS para todas las rutas
app.use(cors());

// Definimos la ruta para la API REST
app.get('/Asin', async(req, res) => {
	try {
		const {
			url
		} = req.query;
		let result = '';

		if (!url) {
			return res.status(400).json({
				error: 'Falta el parámetro URL.'
			});
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
			//console.log('Respuesta encontrada:', response);
			result = response;
		} else {
			// Código restante que se ejecutará si no se encontró la respuesta deseada o si ocurrió algún otro escenario.
			result = await scrapeProductData(url);
		}

		// Devolver el resultado como respuesta de la API formateado
		return res.json(result, null, 2);
	} catch (error) {
		console.error('Error en la API REST:', error);
		return res.status(500).json({
			error: 'Ocurrió un error en el servidor.'
		});
	}
});


// Función para realizar el web scraping con comportamiento Humano
async function scrapeProductData(url) {
  const timestamp = moment().format('YYYY-MM-DD');
  const CodigoPostal = '33142';
  const urlMin = `https://www.amazon.com/dp/${url}?th=1&psc=1`;

  console.log(urlMin);
  let browser;

  try {
    // Iniciar el navegador Chromium
       // Iniciar el navegador Chromium
       browser = await chromium.launchPersistentContext('./prueba', {
        headless: true,
        args: ['--blink-settings=imagesEnabled=false'] //bloqueo de carga de imagenes
      });
    
    const page = await browser.newPage();

    // Navegar a una URL
    await page.goto(urlMin);

    const deliverToActual = await page.$eval('#glow-ingress-line2', el => el.textContent.trim());
    console.log('Enviar Actual:', deliverToActual);

    if (!deliverToActual.includes('Miami')) {
      // Esperar a que aparezca el selector de dirección y hacer clic en él
      await page.waitForSelector('#glow-ingress-line2');
      await page.click('#glow-ingress-line2');
      console.log('Se hizo clic en dirección');

      // Esperar a que aparezca el selector #a-popover-1 en donde se coloca el código postal
      await page.waitForSelector('#GLUXZipUpdateInput');

      // Seleccionar el input del código postal
      await page.click('#GLUXZipUpdateInput');
      console.log('Se hizo clic en el campo de texto');

      // Colocar el código postal deseado en el input
      await page.fill('#GLUXZipUpdateInput', CodigoPostal);
      console.log('Se escribió el código postal');

      // Simular un "Enter" en el campo de entrada para enviar el código postal
      await page.press('#GLUXZipUpdateInput', 'Enter');

      // Esperar a que aparezca el selector #GLUXHiddenSuccessSelectedAddressPlaceholder 
      await page.waitForSelector('#GLUXHiddenSuccessSelectedAddressPlaceholder');
      
      // Esperar a que se actualice el DOM después de cambiar el código postal
      await page.waitForNavigation();
      
      // imprimir nueva dirección de envío
      await page.waitForSelector('#glow-ingress-line2');
      const deliverTo = await page.$eval('#glow-ingress-line2', el => el.textContent.trim());
      console.log('Enviar a:', deliverTo);

      // validar que la dirección sea la correcta
      if (!deliverTo.includes('Miami')) {
        const response = {
          error: 'La dirección no es la correcta.'
        };
        console.log(JSON.stringify(response));
        return response;
      }
    }

    // guardar el html generado
    const pageHTML = await page.content();
    // obtener el html de la pagina con formato JSON
    const response = ObtenerDatos(pageHTML);
    // guardar el log del html generado
    logToFile(pageHTML, url);

    return response;

  } catch (error) {
    console.error('Error al realizar el web scraping:', error);
    return { error: 'Ocurrió un error al realizar el web scraping.' };

  } finally {
    // Cerrar el navegador en caso de error o éxito
    if (browser) {
      await browser.close();
    }
  }
}



//funcion para obtener los datos del html
function ObtenerDatos(html) {
  const $ = cheerio.load(html);
  const result = {}; // Objeto para almacenar los resultados del scrapper

  const ASIN = findASIN($);

  switch (true) {
    case ASIN !== '':
      // Encuentra los elementos en el HTML y extrae la información deseada
      const title = $('#productTitle').text().trim();
      const description = $('#feature-bullets').text().trim();
      const priceFirst = findPrice($);
      const currentTime = moment().format('HH:mm');
      const currentDate = moment().locale('es').format('D [de] MMMM [del] YYYY [a las] HH:mm');

      // agrega la información al objeto result
      result.url = `https://www.amazon.com/dp/${ASIN}?th=1&psc=1`;
      result.titulo = title || "sin datos";
      result.descripcion = description || "sin datos";
      result.precioAmazon = priceFirst || "sin datos";
      result.hora = currentTime;
      result.fecha = currentDate;
      result.ASIN = ASIN;
      break;

    default:
      result.titulo = "sin datos";
      result.descripcion = "sin datos";
      result.precioAmazon = "sin datos";
      result.ASIN = "sin datos";
  }

  return result;
}


// Función para encontrar el ASIN en el HTML
function findASIN($) {
  const asinElement = $('th.a-color-secondary:contains("ASIN")');
  const tdElement = asinElement.next('td');
  let asinValue = tdElement.text().trim();

  if (asinValue === '') {
    // Buscar el elemento 'th' que contiene el nombre "ASIN"
    const thElement = $('th:contains("ASIN")');
    // Obtener el texto del elemento 'td' que le sigue
    const tdElement = thElement.next().text().trim();
    asinValue = tdElement;
  }

  if (asinValue === '') {
    // Encontrar el elemento que contiene el valor del ASIN
    const asinElement = $('span.a-text-bold:contains("ASIN")').next('span');
    // Obtener el valor del ASIN
    asinValue = asinElement.text().trim();
  }

  return asinValue;
}


// Función para encontrar el precio en el HTML
function findPrice($) {
  const possiblePriceSelectors = [
    '#corePrice_feature_div > div > span.a-price.aok-align-center > span.a-offscreen',
    '#corePriceDisplay_desktop_feature_div > div.a-section.a-spacing-none.aok-align-center > span.a-price.aok-align-center.reinventPricePriceToPayMargin.priceToPay > span.a-offscreen',
    '#corePrice_desktop > div > table > tbody > tr:nth-child(2) > td.a-span12 > span.a-price.a-text-price.a-size-medium.apexPriceToPay > span:nth-child(2)',
    '#corePrice_feature_div > span.a-price.a-text-price.header-price.a-size-base.a-text-normal > span:nth-child(2)',
    '#corePrice_feature_div > div > div > span.a-price.a-text-normal.aok-align-center.reinventPriceAccordionT2 > span.a-offscreen'
  ];

  for (const selector of possiblePriceSelectors) {
    const price = $(selector).text().trim();
    if (price !== '') {
      return cleanPrice(price);
    }
  }

  return '';
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

			return {
				fileName: 'logs/' + dateFolder + '/' + foundFile,
				ExpiredCache
			};
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
		fs.mkdirSync(directoryPath, {
			recursive: true
		});
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