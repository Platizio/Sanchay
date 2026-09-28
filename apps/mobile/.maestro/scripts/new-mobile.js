// A fresh, valid Indian mobile (^[6-9][0-9]{9}$) per run, so every flow is a new investor.
output.mobile = `9${String(Date.now()).slice(-9)}`;
