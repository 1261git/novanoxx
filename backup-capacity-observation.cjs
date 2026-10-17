'use strict';
// Historical dashboard data is an observation, never an activation permission.
module.exports=function(observation=require('./docs/backup-capacity-observation.json'),now=Date.now()){
 const at=Date.parse(observation.observedAt),age=now-at;
 const fresh=Number.isSafeInteger(now)&&Number.isFinite(at)&&age>=0&&age<=24*3600000;
 return {source:'READ_ONLY_DASHBOARD_OBSERVATION',observedAt:observation.observedAt,bucketSizeDisplay:observation.bucketSizeDisplay,bucketBytesUpperBound:observation.bucketBytesUpperBound,measurementIsLive:false,fresh,discoverySnapshotBytes:null,operatingActivationAllowed:false,status:fresh?'DISCOVERY_SNAPSHOT_MEASUREMENT_REQUIRED':'DASHBOARD_OBSERVATION_REFRESH_REQUIRED',existingBackupsPreserved:true};
};
