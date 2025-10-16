Simple File Sharer
===

Simple File Sharer is a file uploader written using HTML5 and Node.js.

Clearly, it is not a revolutionary file uploader that will change the way mankind upload their files. Seeing that many people are actually interested in both HTML5 File API and Node.js. Hope it's useful for someone else than me.


Usage
---
1. Clone the repository or download and extract the files.
2. Install Node.js if you haven't already.
3. Go to the directory where index.js etc. are.
4. Edit config.js if you wish to change the upload directory or the port number.
5. Run the application using `node index.js`
6. Go to `http://<IP_ADDRESS>:<PORT>` where `<IP_ADDRESS>` is the IP address of the machine where the application is running and the `<PORT>` is the port number defined in `config.js` which is `8000` by default.
7. Drag and drop files to the marked area to upload the files to the `upload_dir` defined in `config.js`.
8. Copy the url from the dialog and send it to friends and enemies.


Docker Usage
---
### Prerequisites
- Docker
- Docker Compose

### Setup
1. Clone the repository or download and extract the files.
2. Copy `config_example.json` to `config.json`:
   ```bash
   cp config_example.json config.json
   ```
3. Edit `config.json` to customize your configuration:
   - Change `"ip"` to `"0.0.0.0"` to allow external connections
   - Change `"db_name"` to `"/data/memory.db"` for database persistence
   - Customize port, authentication, etc. as needed
4. Build and start the container:
   ```bash
   docker-compose up -d
   ```
5. Access the application at `http://localhost:9898`

### Docker Commands
- **Stop the container**: `docker-compose stop`
- **Start the container**: `docker-compose start`
- **View logs**: `docker-compose logs -f`
- **Rebuild after code changes**: `docker-compose up -d --build`
- **Remove container and volumes**: `docker-compose down -v`

### Notes
- Configuration file must exist before starting the container (see setup step 2).
- Set `"ip": "0.0.0.0"` in config.json to accept connections from outside the container.
- Set `"db_name": "/data/memory.db"` in config.json to persist the database across container restarts.
- Uploaded files are persisted in the `./uploads` directory.
- The database is stored in a Docker volume named `simple-file-sharer_db-data`.
- You can modify `config.json` without rebuilding the container; just restart it with `docker-compose restart`.


License
---
This application is released under the MIT License. See the `LICENSE` file for details.