/**
 * Server Backend
 * 
 * This just processes the request
 *  - Downloads files
 *  - Runs python on it
 *  - Sends output (console or file) to client
 */

const express = require('express');
const formidable = require('formidable');
const childProc = require('child_process');
const moment = require('moment');
const path = require('path');
const fs = require('fs');
const uuid = require('uuid');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.urlencoded({ extended: false }));

app.use(express.static(path.join(__dirname, '..', 'public')));

// TODO: handle errors ?
// app.pose('/submit-form-gsheet', (req, res) => {
// 	new formidable.IncomingForm().parse(req, (err, fields, files) => {
// 		// Expecting fields:
// 		//  - 

// 	});
// });

app.post('/submit-form-files', (req, res) => {
	new formidable.IncomingForm().parse(req, (err, fields, files) => {
		if (err) {
			console.error('Error', err);
			throw err;
		}

		// TODO: Validate fields & files
		console.log('fields: ');
		console.log(fields);
		console.log(fields.chooseOutput);
		console.log('files: ');
		// console.log(files);

		const sub_objpath = files.objFile.filepath;
		const sub_constpath = files.constFile.filepath;

		// First create a folder for this process and copy everything into it
		const execid = uuid.v4();
		fs.mkdirSync(path.join(__dirname, execid));

		fs.copyFileSync(sub_objpath, path.join(__dirname, execid, 'obj.csv'));
		fs.copyFileSync(sub_constpath, path.join(__dirname, execid, 'const.csv'));

		const objpath = path.join(__dirname, execid, 'obj.csv');
		const constpath = path.join(__dirname, execid, 'const.csv');
		const datpath = path.join(__dirname, execid, 'outdat.dat');

		// I may need to copy the files from the temp directory
		const pythonCSVProc = childProc.spawn('python3', [`${path.join(__dirname, '..', 'scripts', 'csv_to_dat.py')}`]);

		console.log(`Obj  path: ${objpath}`);
		console.log(`Constpath: ${constpath}`);
		console.log(`.dat path: ${datpath}`);

		pythonCSVProc.stdin.write(objpath + "\n");
		pythonCSVProc.stdin.write(constpath + "\n");
		pythonCSVProc.stdin.write(datpath + "\n");
		pythonCSVProc.stdin.end();

		pythonCSVProc.stdout.on('data', (data) => console.log(`Got data: ${data}`));
		pythonCSVProc.on('error', (err) => {
			console.error(`Got error with csv process: ${err}`);
			res.status(300);
			res.send(`Error converted to csv: ${err}`);
		});

		pythonCSVProc.on('close', (code, signal) => {
			console.log(`Converter exited with code ${code} signal ${signal}`);

			if (fields.chooseOutput === 'dat') {
				console.log("Now attempting to send file back");

				res.status(400);
				res.contentType('text/plain');

				res.sendFile(datpath, (err) => { 
					if (err) {
						console.error(`Error sending file: ${err}`)
					} else {
						console.log('Sent');
					}

					fs.rmSync(path.join(__dirname, execid), {recursive: true});
				});

			} else {
				console.log("Now attempting to get pyomo output");

				const pythonPyomoProc = childProc.spawn('python3', [`${path.join(__dirname, '..', 'scripts', 'PyomoOptimizer.py')}`]);
				let output = "";
				
				pythonPyomoProc.stdin.write(datpath + "\n");
				pythonPyomoProc.stdin.end();

				pythonPyomoProc.stdout.on('data', (data) => {
					console.log(`Got data: ${data}`);
					output = data;
				});

				pythonPyomoProc.on('error', (err) => {
					console.error(`Got error with pyomo optimization: ${err}`);
					res.status(300);
					res.send(`Error running through pyomo: ${err}`);

					fs.rmSync(path.join(__dirname, execid), {recursive: true});
				})

				pythonPyomoProc.on('close', (code, signal) => {
					res.status(200);
					res.contentType('text/plain');
					res.send(output);

					fs.rmSync(path.join(__dirname, execid), {recursive: true});
				});

			}
		});

	});
});





app.listen(PORT, () => console.log(`Server started on port ${PORT}`));



