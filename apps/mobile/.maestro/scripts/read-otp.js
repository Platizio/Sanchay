// Reads the latest login OTP that the API's Mailpit SMS sender delivered for MOBILE (local dev only).
// The code is taken from the H-6 WebOTP line "@app.sanchay.in #<code>", which is always last.
// Maestro runs scripts on the host, so localhost reaches Mailpit.
(() => {
  const mailpit = typeof MAILPIT_URL !== 'undefined' ? MAILPIT_URL : 'http://localhost:8025';
  const query = encodeURIComponent(`to:"sms-${MOBILE}@sanchay.local"`);
  const deadline = Date.now() + 15000;
  let code = null;
  let spins = 0;
  while (code === null && Date.now() < deadline) {
    const search = http.get(`${mailpit}/api/v1/search?query=${query}&limit=1`);
    if (search.status === 200) {
      const latest = (json(search.body).messages || [])[0];
      if (latest) {
        const message = http.get(`${mailpit}/api/v1/message/${latest.ID}`);
        const match =
          message.status === 200
            ? /@app\.sanchay\.in #(\d{6})/.exec(json(message.body).Text)
            : null;
        if (match) code = match[1];
      }
    }
    if (code === null) {
      // Maestro's script runtime has no sleep(); busy-wait 500 ms between polls.
      const pauseUntil = Date.now() + 500;
      while (Date.now() < pauseUntil) {
        spins += 1;
      }
    }
  }
  if (code === null)
    throw new Error(`No OTP SMS for ${MOBILE} reached Mailpit within 15 s (${spins} spins)`);
  output.otp = code;
})();
