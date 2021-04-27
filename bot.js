const { TelegramClient } = require('messaging-api-telegram');
const puppeteer = require('puppeteer-extra')
const cheerio = require('cheerio');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
require('dotenv').config();

puppeteer.use(StealthPlugin());

const DELAY = process.env.DELAY || 120000;

async function main() {
    const client = new TelegramClient({
        accessToken: process.env.ACCESS_TOKEN,
    });
    const chatId = await getChatId(client, process.env.USERNAME)
    const browser = await puppeteer.launch({
        headless: true,
    });
    const oldHomes = new Set();

    const homes = await getNewHomes(browser, oldHomes);
    homes.forEach(({ link }) => oldHomes.add(link));

    if (homes.length) {
        await sendMessages(client, chatId, homes);
    }
    setInterval(async () => {
        const homes = await getNewHomes(browser, oldHomes);
        console.log('new homes', homes);
        homes.forEach(({ link }) => oldHomes.add(link));

        if (homes.length) {
            await sendMessages(client, chatId, homes)
        }
    }, DELAY);
}

main();

async function getChatId(client, username) {
    const updates = await client.getUpdates();
    const update = updates.find(({ message }) => message && message.chat && message.chat.username === username);
    if (!update) {
        throw new Error(`Chat for ${username} not found`)
    }

    return update.message.chat.id;
}

async function sendMessages(client, chatId, homes = []) {
    homes.map(({ link, title, image, price }) => {
        return client.sendMessage(chatId, `[${pregQuote(title,'\/')}](https://www.avito.ru${link})\n${pregQuote(`${price} руб.`)}\n\n[Изображение](${image})`, { parseMode: 'MarkdownV2'})
    })
}

async function getNewHomes(browser, oldHomes) {
    const page = await browser.newPage();
    await page.goto(process.env.SEARCH_LINK, {
        waitUntil: 'domcontentloaded',
        timeout: 5000
    });
    const content = await page.content();
    const $ = cheerio.load(content);
    const homes = [];
    $('div[data-marker=catalog-serp] > div[data-marker=item]').slice(0, 5).each((idx, elem) => {
        const link = $(elem).find('a').attr('href');
        const image = $(elem).find('img').attr('src');
        const title = $(elem).find('h3').text();
        const price = $(elem).find('meta[itemprop="price"]').attr('content');

        if (oldHomes.has(link)) {
            return;
        }
        homes.push({
            title,
            link,
            image,
            price,
        })
    });
    await page.close();

    return homes;
}

function pregQuote (str, delimiter) {
    return (str + '').replace(new RegExp('[.\\\\+*?\\[\\^\\]$(){}=!<>|:\\' + (delimiter || '') + '-]', 'g'), '\\$&')
}
