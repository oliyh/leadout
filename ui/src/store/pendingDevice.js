// Captures ?device_code=XXX from the URL on first load.
// Call take() once after authentication — it returns the code and clears it,
// preventing duplicate registration if accountId changes again later.

let _code = new URLSearchParams(window.location.search).get('device_code');

export function takePendingDeviceCode() {
    const code = _code;
    _code = null;
    return code;
}
