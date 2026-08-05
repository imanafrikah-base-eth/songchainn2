-- Artists no longer have to provide a Base wallet address up front.
-- They can connect any Base-network wallet later when collecting/claiming.
ALTER TABLE public.artist_applications ALTER COLUMN wallet_address DROP NOT NULL;
