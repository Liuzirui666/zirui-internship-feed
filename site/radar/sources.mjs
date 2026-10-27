// Additional official employer boards. Existing 21 channels remain enabled.
// A monitored board with zero matching internships contributes no invented listings.
export const additionalSources = [
  { id:'applied', name:'Applied Intuition', tier:4, adapter:'ashby', board:'applied', url:'https://jobs.ashbyhq.com/applied' },
  { id:'mercor', name:'Mercor', tier:4, adapter:'ashby', board:'mercor', url:'https://jobs.ashbyhq.com/mercor' },
  { id:'modal', name:'Modal', tier:4, adapter:'ashby', board:'modal', url:'https://jobs.ashbyhq.com/modal' },
  { id:'datologyai', name:'DatologyAI', tier:4, adapter:'ashby', board:'datologyai', url:'https://www.datologyai.com/careers' },
  { id:'primeintellect', name:'Prime Intellect', tier:4, adapter:'ashby', board:'primeintellect', url:'https://www.primeintellect.ai/careers' },
  { id:'grayswan', name:'Gray Swan AI', tier:4, adapter:'ashby', board:'Gray Swan AI', url:'https://jobs.ashbyhq.com/Gray%20Swan%20AI' },
  { id:'patronus', name:'Patronus AI', tier:4, adapter:'ashby', board:'patronus', url:'https://jobs.ashbyhq.com/patronus' },
  { id:'physicalintelligence', name:'Physical Intelligence', tier:4, adapter:'ashby', board:'physicalintelligence', url:'https://jobs.ashbyhq.com/physicalintelligence' },
  { id:'perplexity', name:'Perplexity', tier:4, adapter:'ashby', board:'perplexity', url:'https://jobs.ashbyhq.com/perplexity' },
  { id:'constellation', name:'Constellation', tier:4, adapter:'ashby', board:'constellation', url:'https://jobs.ashbyhq.com/constellation' },
  { id:'atoms', name:'Atoms', tier:4, adapter:'greenhouse', board:'cssmerge', url:'https://job-boards.greenhouse.io/cssmerge' },
  { id:'databricks', name:'Databricks', tier:1, adapter:'greenhouse', board:'databricks', url:'https://job-boards.greenhouse.io/databricks' },
  { id:'samsung', name:'Samsung Research America', tier:1, adapter:'greenhouse', board:'samsungresearchamericainternship', url:'https://job-boards.greenhouse.io/samsungresearchamericainternship' },
  { id:'salesforce', name:'Salesforce', tier:1, adapter:'workday', tenant:'salesforce',host:'salesforce.wd12.myworkdayjobs.com',board:'External_Career_Site',queries:['intern'],url:'https://salesforce.wd12.myworkdayjobs.com/External_Career_Site' },
  { id:'sony', name:'Sony', tier:1,adapter:'workday',tenant:'sonyglobal',host:'sonyglobal.wd1.myworkdayjobs.com',board:'SonyGlobalCareers',queries:['intern'],url:'https://sonyglobal.wd1.myworkdayjobs.com/SonyGlobalCareers' },
  { id:'snowflake',name:'Snowflake',tier:1,adapter:'ashby',board:'snowflake',url:'https://careers.snowflake.com/us/en/search-results' },
  { id:'ibm',name:'IBM',tier:1,adapter:'ibm',url:'https://www.ibm.com/careers/search' },
  { id:'tiktok',name:'TikTok',tier:1,adapter:'tiktok',url:'https://lifeattiktok.com/search' },
  { id:'bytedance',name:'ByteDance',tier:1,adapter:'bytedance',url:'https://joinbytedance.com/search' },
];
