import Toybox.Lang;

// Sim builds hit localhost; device builds hit the deployed server.
// Sim requires "Use Device HTTPS Requirements" disabled in simulator.ini
// (UseHttpsRequirements=0) to allow plain HTTP.
(:sim)
const API_BASE as String = "http://localhost:3000";

(:release)
const API_BASE as String = "https://leadout.oliy.co.uk";
