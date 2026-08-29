ALTER TABLE "Company"
  ADD COLUMN "printerLanHost" TEXT,
  ADD COLUMN "printerLanPort" INTEGER NOT NULL DEFAULT 9100,
  ADD COLUMN "printerWindowsQueue" TEXT,
  ADD COLUMN "printerSerialPort" TEXT,
  ADD COLUMN "printerSerialBaudRate" INTEGER NOT NULL DEFAULT 9600;

