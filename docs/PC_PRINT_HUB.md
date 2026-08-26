# PC Print Hub

## Intended store layout

```text
Android RetailOS phones -- store Wi-Fi --> RetailOS API on controller PC -- LAN / USB / Bluetooth --> receipt printer
```

The API is the only process that formats and sends ESC/POS bytes. Phone browsers do not open a print dialog, need no printer driver, and must not pair with the printer.

## Choose a connection

| RetailOS setting | PC connection | Recommended use |
| --- | --- | --- |
| LAN thermal printer | Raw TCP ESC/POS | Preferred. Give the printer a fixed private IP; most receipt printers use TCP port 9100. Works when RetailOS runs in Docker. |
| USB / Windows printer queue | Windows spooler in `RAW` mode | For a USB printer that has an installed Windows queue. Run the API natively on Windows, not in Docker. |
| Bluetooth or USB serial on PC | Paired Bluetooth COM port or USB serial port | Use only when LAN is impossible. Run the API natively on Windows, not in Docker. |

Generic thermal printers must implement ESC/POS. Vendor-specific protocols and Bluetooth LE-only printers are not supported by the backend print hub.

## Configure the controller PC

1. In RetailOS **Settings → Printer settings**, choose the matching PC print-hub connection, paper width, and footer. Save it. This setting is company-wide, not stored in a cashier phone.
2. Set the matching environment variables on the PC that runs the API.

```dotenv
# LAN (recommended)
RETAILOS_THERMAL_PRINTER_HOST=192.168.1.50
RETAILOS_THERMAL_PRINTER_PORT=9100

# Or Bluetooth Classic paired to COM5 / USB serial on COM5
RETAILOS_THERMAL_PRINTER_SERIAL_PORT=COM5
RETAILOS_THERMAL_PRINTER_SERIAL_BAUD_RATE=9600

# Or a Windows USB print queue, for example the exact name shown by Get-Printer
RETAILOS_THERMAL_PRINTER_WINDOWS_QUEUE=XPrinter XP-80C

# Keep false until plain-text receipts are confirmed.
RETAILOS_THERMAL_PRINTER_INCLUDE_LOGO=false
```

3. Restart the RetailOS API after changing its environment. Press **Test PC printer** in Printer settings. The test is queued through the same backend transport used by every phone.

For the exact Windows queue name, run:

```powershell
Get-Printer | Select-Object Name, DriverName, PortName
```

For a Bluetooth Classic printer, pair it in **Windows Bluetooth settings**, then identify its outgoing COM port in Device Manager. Select **Bluetooth or USB serial on PC** in RetailOS. Do not pair it on cashier phones.

## Docker limitation

Docker Desktop's Linux container cannot directly own Windows USB, Windows printer spooler, or Windows Bluetooth COM devices. When RetailOS runs in Docker on Windows, select **LAN thermal printer**. If USB or Bluetooth must be used, run the same RetailOS API natively on the controller PC with PostgreSQL available locally; do not run a separate company print app.

## Reliability safeguards

- Jobs are held in a single backend queue, so simultaneous phone checkouts cannot interleave printer bytes.
- A receipt is written as one ESC/POS byte stream, not as a PDF, HTML page, or per-line write.
- The raster logo is disabled by default because incompatible raster commands often cause blank/slow output. Enable it only after a successful plain-text test.
- LAN uses a five-second connection timeout and only permits private IPv4 addresses.
- Windows queue printing uses the spooler's `RAW` datatype, preventing the printer driver from interpreting ESC/POS bytes as a graphical page.

## Demo checklist

1. Connect the printer to the controller PC or store LAN and turn it on.
2. Configure the PC environment and restart RetailOS.
3. On the PC, choose the transport and press **Test PC printer**.
4. On an Android phone connected to the same RetailOS server, sign in, make a small sale, and press **Print receipt**.
5. Confirm that the phone shows “Receipt queued on the PC” and that the physical printer outputs exactly one receipt.
6. Reprint the receipt from history while another phone prints a sale; confirm both receipts remain complete and separate.
