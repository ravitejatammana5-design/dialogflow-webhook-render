// index.js — Render-friendly webhook for Dialogflow -> Google Sheets
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;      // set in Render
const APPS_SCRIPT_SECRET = process.env.APPS_SCRIPT_SECRET || ''; // optional

const app = express();
app.use(bodyParser.json());

function genBookingId() {
  return 'BK-' + Math.random().toString(36).slice(2,9).toUpperCase();
}

async function sendToSheet(payload) {
  if (!APPS_SCRIPT_URL) throw new Error('APPS_SCRIPT_URL not set');
  const body = { ...payload };
  if (APPS_SCRIPT_SECRET) body.token = APPS_SCRIPT_SECRET;
  const resp = await axios.post(APPS_SCRIPT_URL, body, { headers: { 'Content-Type': 'application/json' } });
  return resp.data;
}

app.post('/webhook', async (req, res) => {
  try {
    const body = req.body || {};
    const intent = body.queryResult && body.queryResult.intent ? body.queryResult.intent.displayName : null;
    const params = (body.queryResult && body.queryResult.parameters) ? body.queryResult.parameters : {};
    const rawText = (body.queryResult && body.queryResult.queryText) ? body.queryResult.queryText : '';

    // default booking skeleton
    const bookingId = genBookingId();
    const base = {
      bookingId,
      createdAt: new Date().toISOString(),
      domain: 'unknown',
      details: {},
      passenger: {},
      raw: rawText
    };

    // handle booking intents (step-by-step or quick)
    if (intent === 'Book_Bus_Step' || intent === 'Quick_Bus_Booking') {
      base.domain = 'bus';
      base.details = {
        source_city: params.source_city || null,
        destination_city: params.destination_city || null,
        travel_date: params.travel_date || null,
        travel_time: params.travel_time || null,
        seat_type: params.seat_type || null,
        num_passengers: params.num_passengers || null
      };
      base.passenger = { name: params.passenger_name || null, phone: params.contact_phone || null };
    } else if (intent === 'Book_Movie_Step' || intent === 'Quick_Movie_Booking') {
      base.domain = 'movie';
      base.details = {
        movie_title: params.movie_title || null,
        theatre_name: params.theatre_name || null,
        show_date: params.show_date || null,
        show_time: params.show_time || null,
        num_tickets: params.num_tickets || null
      };
      base.passenger = { name: params.passenger_name || null, phone: params.contact_phone || null };
    } else if (intent === 'Book_Museum_Step' || intent === 'Quick_Museum_Booking') {
      base.domain = 'museum';
      base.details = {
        museum_name: params.museum_name || null,
        visit_date: params.visit_date || null,
        slot_time: params.slot_time || null,
        num_tickets: params.num_tickets || null
      };
      base.passenger = { name: params.visitor_name || null, phone: params.contact_phone || null };
    } else if (intent === 'Cancel_Booking') {
      // simple cancellation log
      const cancelId = params.booking_id || rawText.split(' ').pop();
      await sendToSheet({ action: 'CANCEL', bookingId: cancelId, createdAt: new Date().toISOString(), raw: rawText });
      return res.json({ fulfillmentText: `✅ Cancellation requested for ${cancelId}` });
    } else {
      // fallback
      return res.json({ fulfillmentText: "I help with buses, movies and museums bookings. Try 'Book a bus from Hyderabad to Bangalore'." });
    }

    // If passenger info missing, ask for it (Dialogflow should route to Provide_Passenger_Info)
    if (!base.passenger.name || !base.passenger.phone) {
      return res.json({ fulfillmentText: "Please provide passenger name and phone to complete the booking." });
    }

    // Save to Google Sheets via Apps Script
    await sendToSheet(base);

    return res.json({ fulfillmentText: `✅ Booking confirmed. ID: ${base.bookingId}` });
  } catch (err) {
    console.error('Webhook error:', err.message || err);
    return res.json({ fulfillmentText: "Sorry — something went wrong on the server." });
  }
});

app.get('/', (req, res) => res.send('Webhook (Render) running'));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server started on ${PORT}`));
