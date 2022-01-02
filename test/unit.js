const path = require('path');
const { tests } = require('@iobroker/testing');

const jscToolsMock = {
	getDefaultDataDir() { return "iobroker-data"; }
};

// Run unit tests - See https://github.com/ioBroker/testing for a detailed explanation and further options
tests.unit(path.join(__dirname, '..'), {
	additionalMockedModules: {
		"{CONTROLLER_DIR}/build/lib/tools": jscToolsMock,
	}
});
