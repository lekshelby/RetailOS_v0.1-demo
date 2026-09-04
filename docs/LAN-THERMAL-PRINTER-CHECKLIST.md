# RetailOS LAN thermal printer checklist

Use this checklist on the PC that runs the RetailOS print hub. It is for the configured LAN printer at `192.168.0.200:9100`.

1. Confirm the printer is powered on, loaded with the selected paper width, and connected to the shop LAN.
2. In an ordinary PowerShell window, run `Test-NetConnection 192.168.0.200 -Port 9100`. `TcpTestSucceeded` must be `True`.
3. Open RetailOS → Settings → Printer settings as a manager. Confirm the LAN profile address is `192.168.0.200`, port `9100`, and the selected paper width matches the physical roll.
4. Select **Test connection**. It must report the printer as reachable. This probe sends no paper, cut command, sale, or financial record.
5. Select **Test print** once. Check that it includes paper width, divider, English text, `打印机中文测试`, a cut, and the configured footer.
6. If Chinese is garbled, leave Chinese character support on **Auto** and record the result. Do not enable UTF-8 unless the printer test proves it. Select raster mode only after the PC has the required raster-font support installed.
7. Complete one non-production test sale only. Print it once, then use the authorised reprint action once. Verify the second document is labelled `REPRINT` and the sale total, stock, and Bukku records did not change.
8. Temporarily disconnect only the printer network cable (not the PC), invoke a test print, and confirm the UI reports failure. Reconnect it and retry the print. Verify no duplicate sale/payment/stock/Bukku record was created.
9. Record the final paper width, profile name, connection result, and the last successful print time in the store handover notes.

Never use this checklist to print a live customer receipt repeatedly. Test and retry operations are printing-only operations; they must not be used as checkout actions.
