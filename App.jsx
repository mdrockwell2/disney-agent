import { useState, useEffect, useRef, useCallback } from "react";

const API_BASE = "http://3.145.104.10:3001";
const PARKS = ["Magic Kingdom", "EPCOT", "Hollywood Studios", "Animal Kingdom"];
const DAYS   = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

const T = {
  bg:"#0a0a1a", card:"#11112b", border:"#1e1e4a",
  gold:"#FFD700", blue:"#4FC3F7", pink:"#FF6B9D", green:"#69F0AE",
  purple:"#B388FF", orange:"#FFB74D",
  text:"#E8E8FF", dim:"#8888AA",
  short:"#69F0AE", moderate:"#FFD700", long:"#FF6B9D",
};

const LOCAL_RIDES = {
  "Magic Kingdom":[
    {id:"mk1",name:"Seven Dwarfs Mine Train",area:"Fantasyland",avgWait:65,tips:"Rope drop or after 8pm"},
    {id:"mk2",name:"Space Mountain",area:"Tomorrowland",avgWait:45,tips:"Lightning Lane on busy days"},
    {id:"mk3",name:"Big Thunder Mountain",area:"Frontierland",avgWait:35,tips:"Great mid-morning"},
    {id:"mk4",name:"Haunted Mansion",area:"Liberty Square",avgWait:30,tips:"Loads fast, good afternoon"},
    {id:"mk5",name:"Pirates of the Caribbean",area:"Adventureland",avgWait:20,tips:"Low wait most of day"},
    {id:"mk6",name:"Peter Pan's Flight",area:"Fantasyland",avgWait:55,tips:"Always crowded—use LL"},
    {id:"mk7",name:"Jungle Cruise",area:"Adventureland",avgWait:30,tips:"Morning or evening best"},
    {id:"mk8",name:"It's a Small World",area:"Fantasyland",avgWait:15,tips:"Great midday break"},
  ],
  "EPCOT":[
    {id:"ep1",name:"Guardians: Cosmic Rewind",area:"World Discovery",avgWait:70,tips:"Virtual queue—join at 7am"},
    {id:"ep2",name:"Test Track",area:"World Discovery",avgWait:50,tips:"Rope drop for short wait"},
    {id:"ep3",name:"Frozen Ever After",area:"World Showcase",avgWait:55,tips:"Park open or late evening"},
    {id:"ep4",name:"Remy's Ratatouille",area:"World Showcase",avgWait:45,tips:"Book Lightning Lane"},
    {id:"ep5",name:"Soarin'",area:"World Nature",avgWait:40,tips:"Single rider line available"},
    {id:"ep6",name:"Mission: SPACE",area:"World Discovery",avgWait:25,tips:"Hidden gem—often short"},
  ],
  "Hollywood Studios":[
    {id:"hs1",name:"Slinky Dog Dash",area:"Toy Story Land",avgWait:75,tips:"Rope drop essential"},
    {id:"hs2",name:"Rise of the Resistance",area:"Galaxy's Edge",avgWait:80,tips:"First priority at open"},
    {id:"hs3",name:"Millennium Falcon",area:"Galaxy's Edge",avgWait:45,tips:"After Rise of Resistance"},
    {id:"hs4",name:"Tower of Terror",area:"Sunset Boulevard",avgWait:40,tips:"Single rider is fast"},
    {id:"hs5",name:"Star Tours",area:"Echo Lake",avgWait:20,tips:"Rarely crowded"},
    {id:"hs6",name:"Runaway Railway",area:"Hollywood Blvd",avgWait:35,tips:"Moderate waits, fun for all"},
  ],
  "Animal Kingdom":[
    {id:"ak1",name:"Avatar Flight of Passage",area:"Pandora",avgWait:90,tips:"Absolute first priority"},
    {id:"ak2",name:"Na'vi River Journey",area:"Pandora",avgWait:50,tips:"Right after FoP"},
    {id:"ak3",name:"Expedition Everest",area:"Asia",avgWait:45,tips:"Single rider saves time"},
    {id:"ak4",name:"Kilimanjaro Safaris",area:"Africa",avgWait:30,tips:"Morning for active animals"},
    {id:"ak5",name:"DINOSAUR",area:"DinoLand",avgWait:20,tips:"Underrated—usually short"},
  ],
};

function localWaitTimes(park) {
  const h = new Date().getHours();
  const f = (h>=10&&h<=16)?1.4:(h<9||h>19)?0.4:1.0;
  return (LOCAL_RIDES[park]||[]).map(r=>{
    const w=Math.max(5,Math.round(r.avgWait*f+(Math.random()-.5)*20));
    return{...r,currentWait:w,status:w>60?"long":w>30?"moderate":"short"};
  });
}

// ─── CLAUDE CALL ──────────────────────────────────────────────────────────────
async function callClaude(prompt, backendOnline, park, visitDay, rides=[]) {
  if (backendOnline) {
    const r = await fetch(`${API_BASE}/api/chat`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ messages:[{role:"user",content:prompt}], park, visitDay, currentRides:rides })
    });
    const d = await r.json();
    return d.reply;
  } else {
    const r = await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:1500, messages:[{role:"user",content:prompt}] })
    });
    const d = await r.json();
    return d.content?.[0]?.text || "";
  }
}

// ─── PLAN MY DAY ─────────────────────────────────────────────────────────────
const PARK_HOURS = {
  "Magic Kingdom":    { typical:"9:00 AM", close:"11:00 PM" },
  "EPCOT":            { typical:"9:00 AM", close:"9:00 PM"  },
  "Hollywood Studios":{ typical:"8:30 AM", close:"10:00 PM" },
  "Animal Kingdom":   { typical:"8:00 AM", close:"8:00 PM"  },
};
const PARK_EMOJI = {
  "Magic Kingdom":"🏰","EPCOT":"🌍","Hollywood Studios":"🎬","Animal Kingdom":"🦁"
};

// Default trip days – one editable entry per day
function defaultDay(date="", dayNum=1) {
  return {
    id: Date.now() + dayNum,
    date,
    parks: [{ park:"Magic Kingdom", arrive:"9:00 AM", leave:"10:00 PM" }],
    twoPark: false,
  };
}

function PlanMyDay({ rides, backendOnline }) {
  // ── Trip setup ──────────────────────────────────────────────────────────────
  const [step, setStep]           = useState("setup"); // setup | prefs | plan
  const [tripDays, setTripDays]   = useState([defaultDay("", 1)]);
  const [selectedDayIdx, setSelectedDayIdx] = useState(0);

  // ── Preferences ─────────────────────────────────────────────────────────────
  const [prefs, setPrefs] = useState({
    thrillLevel:"all", hasKids:false, hasLightningLane:false,
    lunchTime:"12:30 PM", dinnerTime:"6:00 PM", breakTime:"2:30 PM",
    groupSize:"4", mustDo:"", skipRides:"",
  });

  // ── Generated plans per day index ────────────────────────────────────────────
  const [plans, setPlans]         = useState({});
  const [planLoading, setPlanLoading] = useState(false);

  const selectedDay = tripDays[selectedDayIdx] || tripDays[0];

  // ── Trip day helpers ─────────────────────────────────────────────────────────
  const addDay = () => {
    const newDay = defaultDay("", tripDays.length + 1);
    setTripDays(p=>[...p, newDay]);
    setSelectedDayIdx(tripDays.length);
  };

  const removeDay = (idx) => {
    if (tripDays.length === 1) return;
    setTripDays(p=>p.filter((_,i)=>i!==idx));
    setSelectedDayIdx(Math.max(0, selectedDayIdx - 1));
  };

  const updateDay = (idx, field, value) =>
    setTripDays(p=>p.map((d,i)=>i===idx ? {...d,[field]:value} : d));

  const updatePark = (dayIdx, parkIdx, field, value) =>
    setTripDays(p=>p.map((d,i)=> i!==dayIdx ? d : {
      ...d,
      parks: d.parks.map((pk,j)=> j!==parkIdx ? pk : {...pk,[field]:value})
    }));

  const toggleTwoPark = (idx) => {
    setTripDays(p=>p.map((d,i)=> {
      if (i!==idx) return d;
      const twoPark = !d.twoPark;
      return {
        ...d, twoPark,
        parks: twoPark
          ? [...d.parks, { park:"EPCOT", arrive:"5:00 PM", leave:"10:00 PM" }]
          : [d.parks[0]],
      };
    }));
  };

  // ── Generate plan for selected day ──────────────────────────────────────────
  const generatePlan = async () => {
    setPlanLoading(true);
    const day = tripDays[selectedDayIdx];
    const dateStr = day.date
      ? new Date(day.date + "T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"})
      : `Day ${selectedDayIdx + 1}`;
    const dayOfWeek = day.date
      ? new Date(day.date + "T12:00:00").toLocaleDateString("en-US",{weekday:"long"})
      : "Saturday";

    const parkSummaries = day.parks.map(pk => {
      const rideCtx = (LOCAL_RIDES[pk.park]||[]).map(r=>`${r.name} (avg ${r.avgWait}min, ${r.area})`).join(", ");
      return `${pk.park}: ${pk.arrive} → ${pk.leave}\nRides: ${rideCtx}`;
    }).join("\n\n");

    const isParkHopper = day.parks.length > 1;

    const prompt = `You are an expert Disney World vacation planner. Create a detailed itinerary for ${dateStr} (${dayOfWeek}).

${isParkHopper
  ? `PARK HOPPER DAY — Guest is visiting 2 parks:\n${parkSummaries}\nInclude a park transition slot at the right time. Account for monorail/bus travel (~20-30 min between parks).`
  : `SINGLE PARK DAY:\n${parkSummaries}`}

GROUP: ${prefs.groupSize} people | Kids under 8: ${prefs.hasKids} | Thrill level: ${prefs.thrillLevel} | Lightning Lane: ${prefs.hasLightningLane}
Lunch around: ${prefs.lunchTime} | Dinner around: ${prefs.dinnerTime} | Rest break: ${prefs.breakTime}
${prefs.mustDo ? `Must-do rides: ${prefs.mustDo}` : ""}
${prefs.skipRides ? `Skip: ${prefs.skipRides}` : ""}

Return ONLY valid JSON (no markdown):
{
  "headline": "one-line strategy for the whole day",
  "crowdForecast": "crowd prediction for ${dayOfWeek} at these parks",
  "parks": ["${day.parks.map(p=>p.park).join('", "')}"],
  "slots": [
    {"time":"9:00 AM","park":"${day.parks[0].park}","type":"ride|meal|break|show|tip|travel","title":"Activity name","location":"Area","duration":"30 min","waitEstimate":"15 min","lightningLane":false,"priority":"must|high|medium","note":"tip"}
  ],
  "proTips": ["tip1","tip2","tip3"],
  "lightningLaneOrder": ["Ride A","Ride B"],
  "eveningHighlight": "finale of the day"
}`;

    try {
      const reply = await callClaude(prompt, backendOnline, day.parks[0].park, dayOfWeek, rides);
      const parsed = JSON.parse(reply.replace(/```json|```/g,"").trim());
      setPlans(p=>({...p,[selectedDayIdx]:parsed}));
      setStep("plan");
    } catch(e) {
      setPlans(p=>({...p,[selectedDayIdx]:{error:`Could not generate: ${e.message}`}}));
      setStep("plan");
    }
    setPlanLoading(false);
  };

  const typeColor={ride:T.blue,meal:T.orange,break:T.green,show:T.purple,tip:T.gold,travel:"#E0E0E0"};
  const typeIcon ={ride:"🎢",meal:"🍽️",break:"☀️",show:"🎭",tip:"💡",travel:"🚌"};
  const prioBorder={must:`2px solid ${T.pink}`,high:`1px solid ${T.gold}`,medium:`1px solid ${T.border}`};
  const currentPlan = plans[selectedDayIdx];

  // ── Park card for a day ───────────────────────────────────────────────────
  const ParkCard = ({ dayIdx, parkIdx, pkData }) => (
    <div style={{background:"rgba(255,255,255,.03)",border:`1px solid ${T.border}`,borderRadius:10,padding:12,marginBottom:8}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
        <span style={{fontSize:20}}>{PARK_EMOJI[pkData.park]||"🏰"}</span>
        <select value={pkData.park} onChange={e=>updatePark(dayIdx,parkIdx,"park",e.target.value)}
          style={{flex:1,background:"#11112b",border:`1px solid ${T.border}`,borderRadius:7,color:T.gold,fontSize:12,padding:"6px 9px",fontFamily:"'Lato',sans-serif",cursor:"pointer",fontWeight:700}}>
          {PARKS.map(p=><option key={p} value={p}>{p}</option>)}
        </select>
        {parkIdx===0 && (
          <button onClick={()=>toggleTwoPark(dayIdx)} style={{
            padding:"5px 10px",borderRadius:20,cursor:"pointer",fontSize:10,fontFamily:"'Lato',sans-serif",fontWeight:700,whiteSpace:"nowrap",
            border:`1px solid ${tripDays[dayIdx].twoPark?T.purple:T.border}`,
            background:tripDays[dayIdx].twoPark?"rgba(179,136,255,.15)":"transparent",
            color:tripDays[dayIdx].twoPark?T.purple:T.dim,
          }}>
            {tripDays[dayIdx].twoPark?"✓ Park Hopper":"+ Park Hopper"}
          </button>
        )}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        {[["arrive","Arrive"],["leave","Leave"]].map(([field,label])=>(
          <div key={field}>
            <div style={{fontSize:9,color:T.dim,textTransform:"uppercase",letterSpacing:1.5,marginBottom:3,fontFamily:"'Lato',sans-serif"}}>{label}</div>
            <select value={pkData[field]} onChange={e=>updatePark(dayIdx,parkIdx,field,e.target.value)}
              style={{width:"100%",background:"#11112b",border:`1px solid ${T.border}`,borderRadius:7,color:T.text,fontSize:11,padding:"6px 8px",fontFamily:"'Lato',sans-serif",cursor:"pointer"}}>
              {["7:00 AM","7:30 AM","8:00 AM","8:30 AM","9:00 AM","9:30 AM","10:00 AM","10:30 AM","11:00 AM","11:30 AM","12:00 PM","12:30 PM","1:00 PM","1:30 PM","2:00 PM","3:00 PM","4:00 PM","5:00 PM","6:00 PM","7:00 PM","8:00 PM","9:00 PM","10:00 PM","11:00 PM","12:00 AM"].map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        ))}
      </div>
      {tripDays[dayIdx].twoPark && (
        <div style={{marginTop:6,fontSize:10,color:T.dim,fontFamily:"'Lato',sans-serif"}}>
          {parkIdx===0 ? "🚌 You'll hop to the next park during the day" : "🎆 Evening park — usually less crowded!"}
        </div>
      )}
    </div>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>

      {/* ── Day tab strip ── */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
        {tripDays.map((d,i)=>(
          <button key={d.id} onClick={()=>{setSelectedDayIdx(i);setStep("setup");}} style={{
            padding:"6px 14px",borderRadius:20,cursor:"pointer",fontFamily:"'Lato',sans-serif",fontSize:11,fontWeight:700,
            border:`1px solid ${selectedDayIdx===i?T.gold:T.border}`,
            background:selectedDayIdx===i?"rgba(255,215,0,.12)":"transparent",
            color:selectedDayIdx===i?T.gold:T.dim,
            position:"relative",
          }}>
            Day {i+1}
            {d.date && <span style={{display:"block",fontSize:9,color:T.dim,fontWeight:400}}>
              {new Date(d.date+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}
            </span>}
            {plans[i] && !plans[i].error && <span style={{position:"absolute",top:2,right:4,fontSize:8,color:T.green}}>✓</span>}
          </button>
        ))}
        <button onClick={addDay} style={{padding:"6px 12px",borderRadius:20,cursor:"pointer",border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontFamily:"'Lato',sans-serif",fontSize:11}}>
          + Add Day
        </button>
        {tripDays.length > 1 && (
          <button onClick={()=>removeDay(selectedDayIdx)} style={{padding:"6px 10px",borderRadius:20,cursor:"pointer",border:`1px solid rgba(255,107,157,.3)`,background:"transparent",color:T.pink,fontFamily:"'Lato',sans-serif",fontSize:11}}>
            × Remove
          </button>
        )}
      </div>

      {/* ── Setup panel ── */}
      {step === "setup" && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>

          {/* Date + Park(s) */}
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:16}}>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:11,color:T.gold,letterSpacing:1,marginBottom:12}}>
              📅 DAY {selectedDayIdx+1} — PARK SETUP
            </div>

            {/* Date picker */}
            <div style={{marginBottom:12}}>
              <div style={{fontSize:9,color:T.dim,textTransform:"uppercase",letterSpacing:1.5,marginBottom:4,fontFamily:"'Lato',sans-serif"}}>Visit Date</div>
              <input type="date" value={selectedDay.date}
                onChange={e=>updateDay(selectedDayIdx,"date",e.target.value)}
                style={{width:"100%",background:"rgba(255,255,255,.04)",border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:13,padding:"8px 10px",fontFamily:"'Lato',sans-serif",colorScheme:"dark"}}/>
              {selectedDay.date && (
                <div style={{marginTop:5,fontSize:11,color:T.purple,fontFamily:"'Lato',sans-serif"}}>
                  {new Date(selectedDay.date+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"})}
                </div>
              )}
            </div>

            {/* Park(s) */}
            <div style={{fontSize:9,color:T.dim,textTransform:"uppercase",letterSpacing:1.5,marginBottom:8,fontFamily:"'Lato',sans-serif"}}>
              Park{selectedDay.parks.length>1?"s":""} & Hours
            </div>
            {selectedDay.parks.map((pk,pkIdx)=>(
              <ParkCard key={pkIdx} dayIdx={selectedDayIdx} parkIdx={pkIdx} pkData={pk}/>
            ))}

            {/* Park hopper summary */}
            {selectedDay.twoPark && (
              <div style={{background:"rgba(179,136,255,.06)",border:`1px solid rgba(179,136,255,.2)`,borderRadius:9,padding:"9px 12px",marginTop:4}}>
                <div style={{fontSize:11,color:T.purple,fontFamily:"'Lato',sans-serif",lineHeight:1.6}}>
                  🎟️ <strong>Park Hopper</strong> — Your plan will be split between {selectedDay.parks.map(p=>p.park).join(" and ")}. Claude will include a travel transition and optimize each park block.
                </div>
              </div>
            )}
          </div>

          {/* Preferences */}
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:16}}>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:11,color:T.purple,letterSpacing:1,marginBottom:12}}>⚙️ PREFERENCES (applies to all days)</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10}}>
              {[["groupSize","Group Size"],["lunchTime","Lunch Around"],["dinnerTime","Dinner Around"],["breakTime","Rest Break"]].map(([k,l])=>(
                <div key={k}>
                  <div style={{fontSize:9,color:T.dim,textTransform:"uppercase",letterSpacing:1.5,marginBottom:4,fontFamily:"'Lato',sans-serif"}}>{l}</div>
                  <input value={prefs[k]} onChange={e=>setPrefs(p=>({...p,[k]:e.target.value}))}
                    style={{width:"100%",background:"rgba(255,255,255,.04)",border:`1px solid ${T.border}`,borderRadius:7,color:T.text,fontSize:12,padding:"6px 9px",fontFamily:"'Lato',sans-serif"}}/>
                </div>
              ))}
              <div>
                <div style={{fontSize:9,color:T.dim,textTransform:"uppercase",letterSpacing:1.5,marginBottom:4,fontFamily:"'Lato',sans-serif"}}>Thrill Level</div>
                <select value={prefs.thrillLevel} onChange={e=>setPrefs(p=>({...p,thrillLevel:e.target.value}))}
                  style={{width:"100%",background:"#11112b",border:`1px solid ${T.border}`,borderRadius:7,color:T.gold,fontSize:12,padding:"6px 9px",fontFamily:"'Lato',sans-serif",cursor:"pointer"}}>
                  <option value="all">Mix of everything</option>
                  <option value="high">Thrill rides focus</option>
                  <option value="low">Family-friendly only</option>
                </select>
              </div>
              {[["hasKids","👧 Young Kids (under 8)"],["hasLightningLane","⚡ Lightning Lane"]].map(([k,l])=>(
                <div key={k}>
                  <div style={{fontSize:9,color:T.dim,textTransform:"uppercase",letterSpacing:1.5,marginBottom:4,fontFamily:"'Lato',sans-serif"}}>{l}</div>
                  <button onClick={()=>setPrefs(p=>({...p,[k]:!p[k]}))} style={{width:"100%",padding:"6px 9px",borderRadius:7,border:`1px solid ${prefs[k]?T.green:T.border}`,background:prefs[k]?"rgba(105,240,174,.1)":"transparent",color:prefs[k]?T.green:T.dim,fontSize:12,fontFamily:"'Lato',sans-serif",cursor:"pointer",fontWeight:700,textAlign:"left"}}>
                    {prefs[k]?"✓ Yes":"✗ No"}
                  </button>
                </div>
              ))}
              <div style={{gridColumn:"1/-1"}}>
                <div style={{fontSize:9,color:T.dim,textTransform:"uppercase",letterSpacing:1.5,marginBottom:4,fontFamily:"'Lato',sans-serif"}}>Must-Do Rides</div>
                <input value={prefs.mustDo} onChange={e=>setPrefs(p=>({...p,mustDo:e.target.value}))} placeholder="e.g. Seven Dwarfs, Rise of the Resistance"
                  style={{width:"100%",background:"rgba(255,255,255,.04)",border:`1px solid ${T.border}`,borderRadius:7,color:T.text,fontSize:12,padding:"6px 9px",fontFamily:"'Lato',sans-serif"}}/>
              </div>
              <div style={{gridColumn:"1/-1"}}>
                <div style={{fontSize:9,color:T.dim,textTransform:"uppercase",letterSpacing:1.5,marginBottom:4,fontFamily:"'Lato',sans-serif"}}>Skip These</div>
                <input value={prefs.skipRides} onChange={e=>setPrefs(p=>({...p,skipRides:e.target.value}))} placeholder="e.g. water rides, roller coasters"
                  style={{width:"100%",background:"rgba(255,255,255,.04)",border:`1px solid ${T.border}`,borderRadius:7,color:T.text,fontSize:12,padding:"6px 9px",fontFamily:"'Lato',sans-serif"}}/>
              </div>
            </div>
          </div>

          <button onClick={generatePlan} disabled={planLoading} style={{padding:"14px",background:planLoading?"rgba(179,136,255,.08)":`linear-gradient(135deg,rgba(179,136,255,.2),rgba(79,195,247,.2))`,border:`1px solid ${planLoading?T.dim:T.purple}`,borderRadius:10,color:planLoading?T.dim:T.purple,fontFamily:"'Cinzel',serif",fontSize:13,fontWeight:700,letterSpacing:1,cursor:planLoading?"not-allowed":"pointer"}}>
            {planLoading
              ? "✨ CRAFTING YOUR PERFECT DAY…"
              : `✨ PLAN DAY ${selectedDayIdx+1} — ${selectedDay.parks.map(p=>p.park).join(" + ")}`}
          </button>

          {/* All days overview */}
          {tripDays.length > 1 && (
            <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:14}}>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:11,color:T.blue,letterSpacing:1,marginBottom:10}}>🗓️ TRIP OVERVIEW</div>
              {tripDays.map((d,i)=>(
                <div key={d.id} onClick={()=>{setSelectedDayIdx(i);setStep("setup");}} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:9,cursor:"pointer",marginBottom:5,background:i===selectedDayIdx?"rgba(255,215,0,.06)":"transparent",border:`1px solid ${i===selectedDayIdx?T.gold:T.border}`}}>
                  <div style={{width:28,height:28,borderRadius:"50%",background:plans[i]&&!plans[i].error?"rgba(105,240,174,.15)":"rgba(255,215,0,.1)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Cinzel',serif",fontSize:11,color:plans[i]&&!plans[i].error?T.green:T.gold,fontWeight:700,flexShrink:0}}>
                    {plans[i]&&!plans[i].error?"✓":i+1}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:700,color:T.text,fontFamily:"'Lato',sans-serif"}}>
                      {d.date ? new Date(d.date+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"}) : `Day ${i+1}`}
                    </div>
                    <div style={{fontSize:10,color:T.dim,fontFamily:"'Lato',sans-serif"}}>
                      {d.parks.map(p=>`${PARK_EMOJI[p.park]} ${p.park} (${p.arrive}–${p.leave})`).join(" → ")}
                    </div>
                  </div>
                  <div style={{fontSize:10,color:plans[i]&&!plans[i].error?T.green:T.dim,fontFamily:"'Lato',sans-serif"}}>
                    {plans[i]&&!plans[i].error?"Plan ready →":"Tap to plan →"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Plan view ── */}
      {step === "plan" && (
        <div style={{display:"flex",flexDirection:"column",gap:12,animation:"slideIn .3s ease"}}>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <button onClick={()=>setStep("setup")} style={{padding:"6px 12px",borderRadius:20,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontFamily:"'Lato',sans-serif",fontSize:11,cursor:"pointer"}}>← Back to Setup</button>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:12,color:T.gold,letterSpacing:1}}>
              DAY {selectedDayIdx+1} — {selectedDay.parks.map(p=>p.park).join(" + ").toUpperCase()}
              {selectedDay.date && ` · ${new Date(selectedDay.date+"T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}`}
            </div>
          </div>

          {currentPlan?.error && <div style={{background:"rgba(255,107,157,.1)",border:`1px solid ${T.pink}`,borderRadius:12,padding:14,color:T.pink,fontFamily:"'Lato',sans-serif",fontSize:13}}>⚠️ {currentPlan.error}</div>}

          {currentPlan && !currentPlan.error && (
            <>
              <div style={{background:`linear-gradient(135deg,rgba(179,136,255,.15),rgba(79,195,247,.1))`,border:`1px solid ${T.purple}`,borderRadius:14,padding:16}}>
                <div style={{fontSize:10,color:T.purple,fontFamily:"'Lato',sans-serif",textTransform:"uppercase",letterSpacing:2,marginBottom:4}}>
                  {selectedDay.parks.map(p=>`${PARK_EMOJI[p.park]} ${p.park} ${p.arrive}–${p.leave}`).join("  →  ")}
                </div>
                <div style={{fontFamily:"'Cinzel',serif",fontSize:15,color:T.gold,marginBottom:5}}>🏰 {currentPlan.headline}</div>
                <div style={{fontSize:12,color:T.text,fontFamily:"'Lato',sans-serif",lineHeight:1.6,marginBottom:selectedDay.twoPark?6:0}}>📊 {currentPlan.crowdForecast}</div>
                {selectedDay.twoPark && <div style={{fontSize:11,color:T.purple,fontFamily:"'Lato',sans-serif",marginTop:4}}>🎟️ Park Hopper day — plan covers both parks</div>}
                {currentPlan.eveningHighlight && <div style={{fontSize:12,color:T.purple,fontFamily:"'Lato',sans-serif",marginTop:6}}>🌙 {currentPlan.eveningHighlight}</div>}
              </div>

              {currentPlan.lightningLaneOrder?.length>0 && (
                <div style={{background:T.card,border:`1px solid ${T.gold}`,borderRadius:12,padding:14}}>
                  <div style={{fontFamily:"'Cinzel',serif",fontSize:10,color:T.gold,letterSpacing:1,marginBottom:8}}>⚡ LIGHTNING LANE ORDER</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {currentPlan.lightningLaneOrder.map((r,i)=><span key={i} style={{fontSize:11,padding:"3px 10px",borderRadius:20,background:"rgba(255,215,0,.1)",color:T.gold,fontFamily:"'Lato',sans-serif",border:"1px solid rgba(255,215,0,.25)"}}>{i+1}. {r}</span>)}
                  </div>
                </div>
              )}

              <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
                <div style={{padding:"10px 14px",borderBottom:`1px solid ${T.border}`,fontFamily:"'Cinzel',serif",fontSize:11,color:T.blue,letterSpacing:1}}>📅 HOUR-BY-HOUR ITINERARY</div>
                <div style={{maxHeight:520,overflowY:"auto"}}>
                  {(currentPlan.slots||[]).map((s,i)=>{
                    const isParkSwitch = s.type==="travel";
                    return (
                      <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"11px 14px",borderBottom:`1px solid ${T.border}20`,borderLeft:prioBorder[s.priority]||prioBorder.medium,background:isParkSwitch?"rgba(179,136,255,.06)":s.priority==="must"?"rgba(255,107,157,.04)":s.priority==="high"?"rgba(255,215,0,.02)":"transparent"}}>
                        <div style={{flexShrink:0,width:58,textAlign:"right"}}>
                          <div style={{fontSize:10,fontFamily:"'Cinzel',serif",color:T.gold,fontWeight:700}}>{s.time}</div>
                          <div style={{fontSize:8,color:T.dim,fontFamily:"'Lato',sans-serif"}}>{s.duration}</div>
                        </div>
                        <div style={{fontSize:16,flexShrink:0}}>{typeIcon[s.type]||"📍"}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
                            <span style={{fontSize:12,fontWeight:700,color:typeColor[s.type]||T.text,fontFamily:"'Lato',sans-serif"}}>{s.title}</span>
                            {s.park && selectedDay.twoPark && <span style={{fontSize:8,padding:"1px 5px",borderRadius:6,background:"rgba(179,136,255,.15)",color:T.purple,fontFamily:"'Lato',sans-serif"}}>{PARK_EMOJI[s.park]||""} {s.park}</span>}
                            {s.lightningLane && <span style={{fontSize:8,padding:"1px 5px",borderRadius:6,background:"rgba(255,215,0,.15)",color:T.gold,fontFamily:"'Lato',sans-serif"}}>⚡LL</span>}
                            {s.priority==="must" && <span style={{fontSize:8,padding:"1px 5px",borderRadius:6,background:"rgba(255,107,157,.15)",color:T.pink,fontFamily:"'Lato',sans-serif"}}>MUST</span>}
                          </div>
                          <div style={{fontSize:9,color:T.dim,fontFamily:"'Lato',sans-serif",marginTop:1}}>{s.location}{s.waitEstimate&&s.type==="ride"?` · Est. ${s.waitEstimate}`:""}</div>
                          {s.note && <div style={{fontSize:11,color:T.text,fontFamily:"'Lato',sans-serif",marginTop:3,lineHeight:1.5,opacity:.8}}>{s.note}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {currentPlan.proTips?.length>0 && (
                <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:14}}>
                  <div style={{fontFamily:"'Cinzel',serif",fontSize:10,color:T.gold,letterSpacing:1,marginBottom:8}}>💡 PRO TIPS</div>
                  {currentPlan.proTips.map((tip,i)=>(
                    <div key={i} style={{display:"flex",gap:7,alignItems:"flex-start",marginBottom:6}}>
                      <span style={{color:T.gold,flexShrink:0}}>→</span>
                      <span style={{fontSize:12,color:T.text,fontFamily:"'Lato',sans-serif",lineHeight:1.55}}>{tip}</span>
                    </div>
                  ))}
                </div>
              )}

              <button onClick={()=>setStep("setup")} style={{padding:"10px",background:"transparent",border:`1px solid ${T.border}`,borderRadius:9,color:T.dim,fontFamily:"'Lato',sans-serif",fontSize:12,cursor:"pointer"}}>
                ✏️ Edit Day Setup
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── DAY RECAP ────────────────────────────────────────────────────────────────
function DayRecap({ park, visitDay, backendOnline }) {
  const [rides, setRides]           = useState([]);       // logged rides
  const [moments, setMoments]       = useState([]);       // special moments
  const [familyEmails, setFamilyEmails] = useState("");   // comma-separated
  const [groupName, setGroupName]   = useState("The Family");
  const [rideInput, setRideInput]   = useState({ name:"", wait:"", rating:"⭐⭐⭐⭐⭐", highlight:"" });
  const [momentInput, setMomentInput] = useState("");
  const [sending, setSending]       = useState(false);
  const [sent, setSent]             = useState(false);
  const [preview, setPreview]       = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [activeSection, setActiveSection] = useState("log"); // log | preview | send

  const addRide = () => {
    if (!rideInput.name.trim()) return;
    setRides(prev => [...prev, { ...rideInput, time: new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}), id: Date.now() }]);
    setRideInput({ name:"", wait:"", rating:"⭐⭐⭐⭐⭐", highlight:"" });
  };

  const removeRide = (id) => setRides(prev => prev.filter(r => r.id !== id));

  const addMoment = () => {
    if (!momentInput.trim()) return;
    setMoments(prev => [...prev, { text: momentInput.trim(), time: new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}), id: Date.now() }]);
    setMomentInput("");
  };

  const totalWaitMins = rides.reduce((s, r) => s + (parseInt(r.wait)||0), 0);
  const avgRating = rides.length
    ? Math.round(rides.reduce((s,r) => s + r.rating.length, 0) / rides.length)
    : 5;

  const generatePreview = async () => {
    setPreviewLoading(true); setPreview(null); setActiveSection("preview");
    const rideList = rides.map(r=>`${r.name} (waited ${r.wait||"?"}min, rated ${r.rating}${r.highlight?`, highlight: "${r.highlight}"`:""})`).join("\n");
    const momentList = moments.map(m=>`- ${m.text}`).join("\n");

    const prompt = `You are writing a fun, warm, narrative end-of-day recap email from a Disney World family vacation.

GROUP: ${groupName}
PARK: ${park}
DAY: ${visitDay}
DATE: ${new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"})}

RIDES COMPLETED (${rides.length} total, ${totalWaitMins} total minutes waited):
${rideList || "No rides logged yet"}

SPECIAL MOMENTS:
${momentList || "None logged"}

Write a warm, enthusiastic, story-style recap email that:
1. Opens with a magical Disney-style greeting
2. Tells the day as a narrative story — not a bullet list — weaving in the rides and moments naturally
3. Highlights the funniest or most memorable ride based on their ratings/highlights
4. Includes a fun stat like "We conquered X rides and waited a total of only Y minutes!"
5. Ends with a heartfelt note about making memories together
6. Closes with a signature from ${groupName}

Keep it under 300 words, warm, fun, and family-friendly. Use light Disney magic language.
Write in plain text with simple paragraph breaks — no markdown, no bullet points.`;

    try {
      const reply = await callClaude(prompt, backendOnline, park, visitDay);
      setPreview(reply);
    } catch(e) {
      setPreview(`Could not generate preview: ${e.message}`);
    }
    setPreviewLoading(false);
  };

  const sendRecap = async () => {
    if (!familyEmails.trim()) { alert("Enter at least one email address"); return; }
    if (!preview) { alert("Generate a preview first!"); return; }
    if (!backendOnline) { alert("Backend server must be running to send emails."); return; }
    setSending(true);
    try {
      const r = await fetch(`${API_BASE}/api/send-recap`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          to: familyEmails.split(",").map(e=>e.trim()).filter(Boolean),
          park, visitDay, groupName,
          rides, moments, totalWaitMins,
          body: preview,
          subject: `✨ ${groupName}'s ${park} Adventure — ${new Date().toLocaleDateString("en-US",{month:"long",day:"numeric"})}`,
        })
      });
      const d = await r.json();
      if (d.success) setSent(true);
      else alert(`Send failed: ${d.error}`);
    } catch(e) {
      alert(`Error: ${e.message}`);
    }
    setSending(false);
  };

  const STARS = ["⭐","⭐⭐","⭐⭐⭐","⭐⭐⭐⭐","⭐⭐⭐⭐⭐"];

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>

      {/* Stats bar */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:10}}>
        {[
          {label:"Rides Done",value:rides.length,color:T.blue,icon:"🎢"},
          {label:"Wait Time Saved",value:`${totalWaitMins}m total`,color:T.green,icon:"⏱"},
          {label:"Moments Logged",value:moments.length,color:T.purple,icon:"✨"},
          {label:"Avg Rating",value:"⭐".repeat(Math.min(avgRating,5)),color:T.gold,icon:""},
        ].map(s=>(
          <div key={s.label} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"12px 14px",textAlign:"center"}}>
            <div style={{fontSize:20,marginBottom:3}}>{s.icon}</div>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:14,color:s.color,fontWeight:700}}>{s.value}</div>
            <div style={{fontSize:9,color:T.dim,fontFamily:"'Lato',sans-serif",marginTop:2,textTransform:"uppercase",letterSpacing:1}}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Sub-nav */}
      <div style={{display:"flex",gap:8}}>
        {[["log","📋 Log Your Day"],["preview","✉️ Preview Recap"],["send","📤 Send to Family"]].map(([id,label])=>(
          <button key={id} onClick={()=>setActiveSection(id)} style={{padding:"7px 14px",borderRadius:20,border:`1px solid ${activeSection===id?T.pink:T.border}`,background:activeSection===id?"rgba(255,107,157,.12)":"transparent",color:activeSection===id?T.pink:T.dim,fontFamily:"'Lato',sans-serif",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
            {label}
          </button>
        ))}
      </div>

      {/* ── SECTION: LOG YOUR DAY ── */}
      {activeSection==="log" && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>

          {/* Add ride */}
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:16}}>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:11,color:T.blue,letterSpacing:1,marginBottom:12}}>🎢 LOG A RIDE</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 80px",gap:8,marginBottom:8}}>
              <div>
                <div style={{fontSize:9,color:T.dim,fontFamily:"'Lato',sans-serif",marginBottom:4,textTransform:"uppercase",letterSpacing:1}}>Ride Name</div>
                <input value={rideInput.name} onChange={e=>setRideInput(p=>({...p,name:e.target.value}))}
                  onKeyDown={e=>{if(e.key==="Enter")addRide()}}
                  placeholder="e.g. Space Mountain"
                  style={{width:"100%",background:"rgba(255,255,255,.04)",border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:12,padding:"8px 10px",fontFamily:"'Lato',sans-serif"}}/>
              </div>
              <div>
                <div style={{fontSize:9,color:T.dim,fontFamily:"'Lato',sans-serif",marginBottom:4,textTransform:"uppercase",letterSpacing:1}}>Wait (min)</div>
                <input value={rideInput.wait} onChange={e=>setRideInput(p=>({...p,wait:e.target.value}))} type="number" placeholder="25"
                  style={{width:"100%",background:"rgba(255,255,255,.04)",border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:12,padding:"8px 10px",fontFamily:"'Lato',sans-serif"}}/>
              </div>
            </div>
            <div style={{marginBottom:8}}>
              <div style={{fontSize:9,color:T.dim,fontFamily:"'Lato',sans-serif",marginBottom:4,textTransform:"uppercase",letterSpacing:1}}>Rating</div>
              <div style={{display:"flex",gap:6}}>
                {STARS.map(s=>(
                  <button key={s} onClick={()=>setRideInput(p=>({...p,rating:s}))} style={{padding:"4px 8px",borderRadius:8,border:`1px solid ${rideInput.rating===s?T.gold:T.border}`,background:rideInput.rating===s?"rgba(255,215,0,.15)":"transparent",cursor:"pointer",fontSize:12}}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div style={{marginBottom:10}}>
              <div style={{fontSize:9,color:T.dim,fontFamily:"'Lato',sans-serif",marginBottom:4,textTransform:"uppercase",letterSpacing:1}}>Highlight / Funny Moment (optional)</div>
              <input value={rideInput.highlight} onChange={e=>setRideInput(p=>({...p,highlight:e.target.value}))}
                onKeyDown={e=>{if(e.key==="Enter")addRide()}}
                placeholder="e.g. Dad screamed the whole time!"
                style={{width:"100%",background:"rgba(255,255,255,.04)",border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:12,padding:"8px 10px",fontFamily:"'Lato',sans-serif"}}/>
            </div>
            <button onClick={addRide} style={{width:"100%",padding:"10px",background:"rgba(79,195,247,.1)",border:`1px solid ${T.blue}`,borderRadius:8,color:T.blue,fontFamily:"'Cinzel',serif",fontSize:11,fontWeight:700,cursor:"pointer",letterSpacing:1}}>
              + ADD RIDE TO LOG
            </button>
          </div>

          {/* Ride log */}
          {rides.length > 0 && (
            <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
              <div style={{padding:"10px 14px",borderBottom:`1px solid ${T.border}`,fontFamily:"'Cinzel',serif",fontSize:11,color:T.green,letterSpacing:1}}>
                ✓ RIDES LOGGED TODAY ({rides.length})
              </div>
              <div style={{maxHeight:240,overflowY:"auto"}}>
                {rides.map((r,i)=>(
                  <div key={r.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 14px",borderBottom:`1px solid ${T.border}20`}}>
                    <div style={{width:22,height:22,borderRadius:"50%",background:T.green,color:"#000",fontSize:10,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontFamily:"'Lato',sans-serif"}}>{i+1}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:700,color:T.text,fontFamily:"'Lato',sans-serif"}}>{r.name}</div>
                      <div style={{fontSize:10,color:T.dim,fontFamily:"'Lato',sans-serif"}}>{r.time} · waited {r.wait||"?"}min · {r.rating}</div>
                      {r.highlight && <div style={{fontSize:10,color:T.orange,fontFamily:"'Lato',sans-serif",marginTop:1}}>💬 {r.highlight}</div>}
                    </div>
                    <button onClick={()=>removeRide(r.id)} style={{background:"transparent",border:"none",color:T.dim,fontSize:16,cursor:"pointer",padding:"2px 6px",borderRadius:6}}>×</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Special moments */}
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:16}}>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:11,color:T.purple,letterSpacing:1,marginBottom:10}}>✨ LOG A SPECIAL MOMENT</div>
            <div style={{display:"flex",gap:8}}>
              <input value={momentInput} onChange={e=>setMomentInput(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter")addMoment()}}
                placeholder="e.g. Met Mickey Mouse! Kids lost their minds 🎉"
                style={{flex:1,background:"rgba(255,255,255,.04)",border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:12,padding:"8px 10px",fontFamily:"'Lato',sans-serif"}}/>
              <button onClick={addMoment} style={{padding:"8px 14px",background:"rgba(179,136,255,.1)",border:`1px solid ${T.purple}`,borderRadius:8,color:T.purple,fontFamily:"'Lato',sans-serif",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>+ Add</button>
            </div>
            {moments.length>0 && (
              <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:6}}>
                {moments.map(m=>(
                  <div key={m.id} style={{display:"flex",gap:8,alignItems:"center",padding:"6px 10px",borderRadius:8,background:"rgba(179,136,255,.06)",border:`1px solid rgba(179,136,255,.15)`}}>
                    <span style={{fontSize:12,color:T.purple}}>✨</span>
                    <span style={{flex:1,fontSize:11,color:T.text,fontFamily:"'Lato',sans-serif"}}>{m.text}</span>
                    <span style={{fontSize:9,color:T.dim,fontFamily:"'Lato',sans-serif"}}>{m.time}</span>
                    <button onClick={()=>setMoments(p=>p.filter(x=>x.id!==m.id))} style={{background:"transparent",border:"none",color:T.dim,cursor:"pointer",fontSize:14}}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button onClick={generatePreview} style={{padding:"13px",background:`linear-gradient(135deg,rgba(255,107,157,.2),rgba(255,183,77,.2))`,border:`1px solid ${T.pink}`,borderRadius:10,color:T.pink,fontFamily:"'Cinzel',serif",fontSize:13,fontWeight:700,cursor:"pointer",letterSpacing:1}}>
            ✉️ GENERATE RECAP EMAIL PREVIEW →
          </button>
        </div>
      )}

      {/* ── SECTION: PREVIEW ── */}
      {activeSection==="preview" && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {previewLoading && (
            <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:40,textAlign:"center",color:T.purple,fontFamily:"'Cinzel',serif",fontSize:13}}>
              ✨ Claude is writing your day recap…
            </div>
          )}
          {!previewLoading && !preview && (
            <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:30,textAlign:"center"}}>
              <div style={{color:T.dim,fontFamily:"'Lato',sans-serif",fontSize:13,marginBottom:16}}>Generate a preview to see your recap email.</div>
              <button onClick={generatePreview} style={{padding:"11px 24px",background:"rgba(255,107,157,.12)",border:`1px solid ${T.pink}`,borderRadius:9,color:T.pink,fontFamily:"'Cinzel',serif",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                ✉️ GENERATE PREVIEW
              </button>
            </div>
          )}
          {preview && !previewLoading && (
            <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
              <div style={{padding:"10px 16px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontFamily:"'Cinzel',serif",fontSize:11,color:T.pink,letterSpacing:1}}>📧 RECAP PREVIEW</span>
                <button onClick={generatePreview} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.dim,borderRadius:7,padding:"3px 9px",fontSize:10,cursor:"pointer",fontFamily:"'Lato',sans-serif"}}>↺ Regenerate</button>
              </div>
              {/* Email preview card */}
              <div style={{padding:20}}>
                <div style={{background:"linear-gradient(135deg,#0d0d5e,#1e1e8e)",borderRadius:"12px 12px 0 0",padding:"20px 24px",textAlign:"center"}}>
                  <div style={{fontSize:28,marginBottom:4}}>✨🏰✨</div>
                  <div style={{color:T.gold,fontFamily:"'Cinzel',serif",fontSize:16,letterSpacing:1}}>{groupName}'s Disney Day Recap!</div>
                  <div style={{color:"#9090e0",fontSize:11,marginTop:4,fontFamily:"'Lato',sans-serif"}}>{park} · {visitDay} · {new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</div>
                </div>
                <div style={{background:"rgba(255,255,255,.03)",border:`1px solid ${T.border}`,borderRadius:"0 0 12px 12px",padding:"20px 24px"}}>
                  {/* Stats pills */}
                  <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
                    <span style={{fontSize:11,padding:"3px 10px",borderRadius:20,background:"rgba(105,240,174,.1)",color:T.green,fontFamily:"'Lato',sans-serif",border:`1px solid rgba(105,240,174,.2)`}}>🎢 {rides.length} rides</span>
                    <span style={{fontSize:11,padding:"3px 10px",borderRadius:20,background:"rgba(255,215,0,.1)",color:T.gold,fontFamily:"'Lato',sans-serif",border:`1px solid rgba(255,215,0,.2)`}}>⏱ {totalWaitMins}min waited</span>
                    <span style={{fontSize:11,padding:"3px 10px",borderRadius:20,background:"rgba(179,136,255,.1)",color:T.purple,fontFamily:"'Lato',sans-serif",border:`1px solid rgba(179,136,255,.2)`}}>✨ {moments.length} moments</span>
                  </div>
                  {/* Body text */}
                  <div style={{fontSize:13,color:T.text,fontFamily:"'Lato',sans-serif",lineHeight:1.8,whiteSpace:"pre-wrap"}}>{preview}</div>
                  {/* Ride list */}
                  {rides.length>0 && (
                    <div style={{marginTop:16,padding:12,background:"rgba(79,195,247,.06)",borderRadius:10,border:`1px solid rgba(79,195,247,.12)`}}>
                      <div style={{fontFamily:"'Cinzel',serif",fontSize:10,color:T.blue,letterSpacing:1,marginBottom:8}}>TODAY'S RIDE LOG</div>
                      {rides.map((r,i)=>(
                        <div key={r.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0",borderBottom:i<rides.length-1?`1px solid rgba(79,195,247,.08)`:"none"}}>
                          <span style={{fontSize:11,color:T.text,fontFamily:"'Lato',sans-serif"}}>{i+1}. {r.name}</span>
                          <span style={{fontSize:10,color:T.dim,fontFamily:"'Lato',sans-serif"}}>{r.rating} · {r.wait||"?"}min wait</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SECTION: SEND ── */}
      {activeSection==="send" && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {sent ? (
            <div style={{background:"rgba(105,240,174,.1)",border:`1px solid ${T.green}`,borderRadius:14,padding:40,textAlign:"center"}}>
              <div style={{fontSize:48,marginBottom:12}}>🎉</div>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:18,color:T.green,marginBottom:8}}>RECAP SENT!</div>
              <div style={{fontSize:13,color:T.text,fontFamily:"'Lato',sans-serif"}}>Your family is going to love reading about today's adventure!</div>
              <button onClick={()=>{setSent(false);setActiveSection("log");}} style={{marginTop:16,padding:"9px 20px",background:"transparent",border:`1px solid ${T.green}`,borderRadius:8,color:T.green,fontFamily:"'Lato',sans-serif",fontSize:12,cursor:"pointer"}}>Plan Another Day</button>
            </div>
          ) : (
            <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:20}}>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:12,color:T.pink,letterSpacing:1,marginBottom:16}}>📤 SEND RECAP TO FAMILY</div>
              <div style={{marginBottom:12}}>
                <div style={{fontSize:9,color:T.dim,textTransform:"uppercase",letterSpacing:1.5,marginBottom:5,fontFamily:"'Lato',sans-serif"}}>Your Group Name</div>
                <input value={groupName} onChange={e=>setGroupName(e.target.value)}
                  style={{width:"100%",background:"rgba(255,255,255,.04)",border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:13,padding:"9px 12px",fontFamily:"'Lato',sans-serif"}}/>
              </div>
              <div style={{marginBottom:16}}>
                <div style={{fontSize:9,color:T.dim,textTransform:"uppercase",letterSpacing:1.5,marginBottom:5,fontFamily:"'Lato',sans-serif"}}>Family Email Addresses (comma-separated)</div>
                <textarea value={familyEmails} onChange={e=>setFamilyEmails(e.target.value)} rows={3}
                  placeholder="grandma@gmail.com, uncle.bob@gmail.com, cousins@gmail.com"
                  style={{width:"100%",background:"rgba(255,255,255,.04)",border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:12,padding:"9px 12px",fontFamily:"'Lato',sans-serif",resize:"none"}}/>
              </div>
              {!preview && (
                <div style={{padding:"10px 14px",background:"rgba(255,215,0,.06)",border:`1px solid rgba(255,215,0,.2)`,borderRadius:8,marginBottom:12,fontSize:11,color:T.gold,fontFamily:"'Lato',sans-serif"}}>
                  ⚠️ Generate a preview first before sending!
                </div>
              )}
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>{generatePreview();setActiveSection("preview");}} style={{flex:1,padding:"11px",background:"rgba(255,215,0,.08)",border:`1px solid ${T.gold}`,borderRadius:8,color:T.gold,fontFamily:"'Lato',sans-serif",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                  {preview?"↺ Regenerate Preview":"✉️ Generate Preview First"}
                </button>
                <button onClick={sendRecap} disabled={sending||!preview||!backendOnline} style={{flex:1,padding:"11px",background:sending?"rgba(105,240,174,.05)":`linear-gradient(135deg,rgba(255,107,157,.2),rgba(255,183,77,.2))`,border:`1px solid ${T.pink}`,borderRadius:8,color:T.pink,fontFamily:"'Cinzel',serif",fontSize:12,fontWeight:700,cursor:(sending||!preview||!backendOnline)?"not-allowed":"pointer",opacity:(sending||!preview||!backendOnline)?.5:1,letterSpacing:.5}}>
                  {sending?"SENDING…":"🚀 SEND TO FAMILY"}
                </button>
              </div>
              {!backendOnline && <div style={{marginTop:8,fontSize:10,color:T.dim,fontFamily:"'Lato',sans-serif",textAlign:"center"}}>Backend must be running to send real emails</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── WEATHER COMPONENT ────────────────────────────────────────────────────────
// Uses Open-Meteo — completely free, no API key, updates every 15 min
// Disney World coords: 28.3852°N, 81.5639°W (Walt Disney World Resort, Orlando FL)
const WDW_LAT = 28.3852;
const WDW_LON = -81.5639;

const WMO_CODES = {
  0:"Clear Sky",1:"Mainly Clear",2:"Partly Cloudy",3:"Overcast",
  45:"Foggy",48:"Icy Fog",
  51:"Light Drizzle",53:"Drizzle",55:"Heavy Drizzle",
  61:"Light Rain",63:"Rain",65:"Heavy Rain",
  71:"Light Snow",73:"Snow",75:"Heavy Snow",77:"Snow Grains",
  80:"Light Showers",81:"Showers",82:"Heavy Showers",
  85:"Snow Showers",86:"Heavy Snow Showers",
  95:"Thunderstorm",96:"Thunderstorm + Hail",99:"Thunderstorm + Heavy Hail",
};

const WMO_EMOJI = {
  0:"☀️",1:"🌤️",2:"⛅",3:"☁️",
  45:"🌫️",48:"🌫️",
  51:"🌦️",53:"🌦️",55:"🌧️",
  61:"🌧️",63:"🌧️",65:"🌧️",
  71:"🌨️",73:"❄️",75:"❄️",77:"🌨️",
  80:"🌦️",81:"🌧️",82:"⛈️",
  85:"🌨️",86:"❄️",
  95:"⛈️",96:"⛈️",99:"⛈️",
};

// Park-specific weather tips
function weatherTip(code, tempF, humidity) {
  if (code >= 95) return "⛈️ Thunderstorm likely — rides may pause 30–45 min. Head to covered shows or indoor attractions.";
  if (code >= 80) return "🌧️ Showers expected — pack a poncho! Lines get shorter when it rains. Great time for indoor rides.";
  if (code >= 61) return "☔ Rain gear recommended. Many guests leave during rain — waits drop significantly!";
  if (code >= 51) return "🌦️ Light drizzle possible. Keep a compact umbrella handy.";
  if (tempF >= 95) return "🥵 Extreme heat today. Hydrate constantly, take midday breaks in AC, and use the Disney app water station map.";
  if (tempF >= 88) return "☀️ Hot day ahead. Hit outdoor rides early, seek shade 12–3pm, and enjoy AC attractions midday.";
  if (tempF >= 78) return "😊 Great park weather! Comfortable for most of the day — enjoy outdoor rides freely.";
  if (tempF <= 55) return "🧥 Chilly for Orlando! Bring a jacket — waits will be shorter as fewer guests visit.";
  return "✅ Comfortable conditions — a great day to be in the parks!";
}

// UV index label
function uvLabel(uv) {
  if (uv <= 2) return {label:"Low", color:T.green};
  if (uv <= 5) return {label:"Moderate", color:T.gold};
  if (uv <= 7) return {label:"High", color:T.orange};
  if (uv <= 10) return {label:"Very High", color:T.pink};
  return {label:"Extreme", color:"#ff4444"};
}

function WeatherTab() {
  const [weather, setWeather]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  const fetchWeather = async () => {
    setLoading(true); setError(null);
    try {
      const url = `https://api.open-meteo.com/v1/forecast`
        + `?latitude=${WDW_LAT}&longitude=${WDW_LON}`
        + `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,wind_speed_10m,wind_gusts_10m,uv_index,is_day`
        + `&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m`
        + `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset`
        + `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch`
        + `&timezone=America%2FNew_York&forecast_days=1`;

      const res  = await fetch(url);
      const data = await res.json();
      const c    = data.current;
      const d    = data.daily;
      const h    = data.hourly;

      // Build hourly forecast for rest of today
      const now    = new Date();
      const nowHr  = now.getHours();
      const hourly = h.time
        .map((t, i) => ({
          time: t,
          hour: new Date(t).getHours(),
          temp: Math.round(h.temperature_2m[i]),
          pop:  h.precipitation_probability[i],
          code: h.weather_code[i],
          wind: Math.round(h.wind_speed_10m[i]),
        }))
        .filter(x => x.hour >= nowHr && x.hour <= 22)
        .slice(0, 8);

      setWeather({
        temp:       Math.round(c.temperature_2m),
        feelsLike:  Math.round(c.apparent_temperature),
        humidity:   c.relative_humidity_2m,
        wind:       Math.round(c.wind_speed_10m),
        gusts:      Math.round(c.wind_gusts_10m),
        rain:       c.rain,
        code:       c.weather_code,
        uv:         Math.round(c.uv_index),
        isDay:      c.is_day,
        high:       Math.round(d.temperature_2m_max[0]),
        low:        Math.round(d.temperature_2m_min[0]),
        maxPop:     d.precipitation_probability_max[0],
        maxUv:      Math.round(d.uv_index_max[0]),
        sunrise:    d.sunrise[0],
        sunset:     d.sunset[0],
        hourly,
      });
      setLastFetch(new Date());
    } catch(e) {
      setError(`Could not load weather: ${e.message}`);
    }
    setLoading(false);
  };

  useEffect(() => { fetchWeather(); }, []);

  // Format sunrise/sunset nicely
  const fmtTime = (iso) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
  };

  if (loading) return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:60,gap:12}}>
      <div style={{fontSize:40}}>🌤️</div>
      <div style={{color:T.dim,fontFamily:"'Cinzel',serif",fontSize:12,letterSpacing:2}}>FETCHING WEATHER…</div>
      <div style={{fontSize:11,color:T.dim,fontFamily:"'Lato',sans-serif"}}>Loading live data from Walt Disney World, Orlando FL</div>
    </div>
  );

  if (error) return (
    <div style={{background:"rgba(255,107,157,.1)",border:`1px solid ${T.pink}`,borderRadius:14,padding:24,textAlign:"center"}}>
      <div style={{fontSize:32,marginBottom:8}}>⚠️</div>
      <div style={{color:T.pink,fontFamily:"'Lato',sans-serif",fontSize:13,marginBottom:12}}>{error}</div>
      <button onClick={fetchWeather} style={{padding:"8px 20px",background:"transparent",border:`1px solid ${T.pink}`,borderRadius:8,color:T.pink,fontFamily:"'Lato',sans-serif",fontSize:12,cursor:"pointer"}}>Try Again</button>
    </div>
  );

  if (!weather) return null;

  const emoji   = WMO_EMOJI[weather.code] || "🌡️";
  const desc    = WMO_CODES[weather.code]  || "Unknown";
  const tip     = weatherTip(weather.code, weather.temp, weather.humidity);
  const uv      = uvLabel(weather.uv);
  const isHot   = weather.temp >= 88;
  const isRainy = weather.code >= 51;
  const isStormy= weather.code >= 95;

  // Background gradient based on conditions
  const heroBg  = isStormy
    ? "linear-gradient(135deg,rgba(30,30,80,.8),rgba(80,40,40,.6))"
    : isRainy
    ? "linear-gradient(135deg,rgba(20,40,80,.8),rgba(30,60,80,.6))"
    : isHot
    ? "linear-gradient(135deg,rgba(80,40,10,.6),rgba(60,20,60,.6))"
    : "linear-gradient(135deg,rgba(10,30,70,.8),rgba(20,50,80,.6))";

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14,animation:"slideIn .3s ease"}}>

      {/* Hero current weather card */}
      <div style={{background:heroBg,border:`1px solid ${T.border}`,borderRadius:18,padding:"24px 28px",position:"relative",overflow:"hidden"}}>
        {/* Subtle background emoji watermark */}
        <div style={{position:"absolute",right:16,top:8,fontSize:100,opacity:.07,pointerEvents:"none",lineHeight:1}}>{emoji}</div>

        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:16}}>
          {/* Left: main temp */}
          <div>
            <div style={{fontSize:11,color:T.dim,fontFamily:"'Lato',sans-serif",letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>
              Walt Disney World · Orlando, FL
            </div>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:4}}>
              <span style={{fontSize:64,lineHeight:1}}>{emoji}</span>
              <div>
                <div style={{fontFamily:"'Cinzel',serif",fontSize:56,fontWeight:900,color:T.text,lineHeight:1}}>
                  {weather.temp}°
                </div>
                <div style={{fontSize:13,color:T.dim,fontFamily:"'Lato',sans-serif"}}>Feels like {weather.feelsLike}°F</div>
              </div>
            </div>
            <div style={{fontSize:16,color:T.gold,fontFamily:"'Cinzel',serif",letterSpacing:1}}>{desc}</div>
          </div>

          {/* Right: today's range + stats */}
          <div style={{display:"flex",flexDirection:"column",gap:10,minWidth:160}}>
            <div style={{display:"flex",gap:16}}>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:18,color:T.pink,fontFamily:"'Cinzel',serif",fontWeight:700}}>{weather.high}°</div>
                <div style={{fontSize:9,color:T.dim,fontFamily:"'Lato',sans-serif",textTransform:"uppercase",letterSpacing:1}}>High</div>
              </div>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:18,color:T.blue,fontFamily:"'Cinzel',serif",fontWeight:700}}>{weather.low}°</div>
                <div style={{fontSize:9,color:T.dim,fontFamily:"'Lato',sans-serif",textTransform:"uppercase",letterSpacing:1}}>Low</div>
              </div>
            </div>
            {[
              {icon:"💧", label:"Humidity",  value:`${weather.humidity}%`},
              {icon:"💨", label:"Wind",      value:`${weather.wind} mph${weather.gusts>weather.wind+5?` (gusts ${weather.gusts})`:""}`},
              {icon:"🌧️", label:"Rain today",value:`${weather.maxPop}% chance`},
              {icon:"☀️", label:"UV Index",  value:<span style={{color:uv.color}}>{weather.maxUv} — {uv.label}</span>},
              {icon:"🌅", label:"Sunrise",   value:fmtTime(weather.sunrise)},
              {icon:"🌇", label:"Sunset",    value:fmtTime(weather.sunset)},
            ].map(({icon,label,value})=>(
              <div key={label} style={{display:"flex",alignItems:"center",gap:7}}>
                <span style={{fontSize:13,width:18,textAlign:"center"}}>{icon}</span>
                <span style={{fontSize:10,color:T.dim,fontFamily:"'Lato',sans-serif",width:70}}>{label}</span>
                <span style={{fontSize:11,color:T.text,fontFamily:"'Lato',sans-serif",fontWeight:600}}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Last updated */}
        <div style={{marginTop:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:10,color:T.dim,fontFamily:"'Lato',sans-serif"}}>
            {lastFetch ? `Updated ${lastFetch.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})} · Open-Meteo` : ""}
          </div>
          <button onClick={fetchWeather} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.dim,borderRadius:8,padding:"3px 10px",fontSize:10,cursor:"pointer",fontFamily:"'Lato',sans-serif"}}>↺ Refresh</button>
        </div>
      </div>

      {/* Disney-specific weather tip */}
      <div style={{
        background: isStormy?"rgba(255,107,157,.08)":isRainy?"rgba(79,195,247,.08)":"rgba(105,240,174,.08)",
        border:`1px solid ${isStormy?T.pink:isRainy?T.blue:T.green}`,
        borderRadius:12, padding:"14px 18px",
      }}>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:10,color:isStormy?T.pink:isRainy?T.blue:T.green,letterSpacing:1.5,marginBottom:6,textTransform:"uppercase"}}>
          🏰 Park Weather Tip
        </div>
        <div style={{fontSize:13,color:T.text,fontFamily:"'Lato',sans-serif",lineHeight:1.65}}>{tip}</div>
      </div>

      {/* Hourly forecast */}
      {weather.hourly.length > 0 && (
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
          <div style={{padding:"10px 16px",borderBottom:`1px solid ${T.border}`,fontFamily:"'Cinzel',serif",fontSize:11,color:T.blue,letterSpacing:1}}>
            ⏰ HOURLY FORECAST — TODAY
          </div>
          <div style={{display:"flex",overflowX:"auto",padding:"14px 12px",gap:8}}>
            {weather.hourly.map((h, i) => {
              const hrLabel = new Date(h.time).toLocaleTimeString([], {hour:"numeric"});
              const hEmoji  = WMO_EMOJI[h.code] || "🌡️";
              const popColor= h.pop >= 70 ? T.pink : h.pop >= 40 ? T.gold : T.dim;
              return (
                <div key={i} style={{
                  display:"flex",flexDirection:"column",alignItems:"center",gap:5,
                  padding:"10px 12px",borderRadius:12,minWidth:64,flexShrink:0,
                  background: i===0?"rgba(255,215,0,.08)":"rgba(255,255,255,.02)",
                  border:`1px solid ${i===0?T.gold:T.border}`,
                }}>
                  <div style={{fontSize:10,color:i===0?T.gold:T.dim,fontFamily:"'Lato',sans-serif",fontWeight:i===0?700:400}}>{i===0?"Now":hrLabel}</div>
                  <div style={{fontSize:20}}>{hEmoji}</div>
                  <div style={{fontFamily:"'Cinzel',serif",fontSize:14,color:T.text,fontWeight:700}}>{h.temp}°</div>
                  <div style={{fontSize:9,color:popColor,fontFamily:"'Lato',sans-serif"}}>{h.pop}% 🌧️</div>
                  <div style={{fontSize:9,color:T.dim,fontFamily:"'Lato',sans-serif"}}>{h.wind}mph</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick tips grid */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:10}}>
        {[
          {
            title:"Best Times to Be Outside",
            icon:"🌤️",
            color:T.green,
            tips: weather.temp>=90
              ? ["Before 11am and after 6pm","Seek AC during 12–4pm peak heat","Frozen treats at every opportunity!"]
              : weather.code>=80
              ? ["Check radar before queueing outdoor rides","Indoor rides have shorter waits in rain","Ponchos from park gift shops save the day"]
              : ["Outdoor rides are great all day","Evening shows are magical in good weather","Golden hour near Cinderella Castle at sunset"],
          },
          {
            title:"What to Wear",
            icon:"👕",
            color:T.blue,
            tips: weather.temp>=90
              ? ["Light breathable fabrics only","Sunscreen SPF 50+ — reapply every 2hrs","Cooling towels and handheld fan essential"]
              : weather.temp<=65
              ? ["Layers — parks warm up by midday","Light jacket for morning and evening","Comfortable walking shoes as always"]
              : ["Light layers — comfortable throughout","Sunscreen even on cloudy days","Comfortable shoes for 8+ miles of walking"],
          },
          {
            title:"Ride Strategy",
            icon:"🎢",
            color:T.purple,
            tips: weather.code>=95
              ? ["Head indoors immediately during lightning","Haunted Mansion, Space Mountain, EPCOT films","Rides reopen 15–30min after storms clear"]
              : weather.code>=61
              ? ["Rain = shorter lines! Stay and ride more","Water rides don't matter — you're wet anyway","Keep phone in waterproof bag"]
              : weather.temp>=88
              ? ["Rope drop all outdoor headliners first","Midday = indoor rides and AC breaks","Return for evening fireworks in cooler temps"]
              : ["Great conditions — normal strategy applies","Enjoy outdoor seating at restaurants","All parks operate at full capacity"],
          },
        ].map(card=>(
          <div key={card.title} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:14}}>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:10,color:card.color,letterSpacing:1,marginBottom:8}}>{card.icon} {card.title.toUpperCase()}</div>
            {card.tips.map((t,i)=>(
              <div key={i} style={{display:"flex",gap:6,alignItems:"flex-start",marginBottom:5}}>
                <span style={{color:card.color,flexShrink:0,fontSize:11,marginTop:1}}>→</span>
                <span style={{fontSize:11,color:T.text,fontFamily:"'Lato',sans-serif",lineHeight:1.5}}>{t}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div style={{textAlign:"center",fontSize:10,color:T.dim,fontFamily:"'Lato',sans-serif"}}>
        Weather data from <a href="https://open-meteo.com" target="_blank" rel="noreferrer" style={{color:T.blue}}>Open-Meteo</a> · Free & open-source · Updated every 15 minutes
      </div>
    </div>
  );
}

// ─── ENTERTAINMENT SCHEDULE ───────────────────────────────────────────────────
const ENTERTAINMENT = {
  "Magic Kingdom": [
    { id:"mk-e1",  name:"Festival of Fantasy Parade",       type:"parade",    area:"Main Street U.S.A.", times:["12:00 PM","3:00 PM"],                   duration:"12 min",  icon:"🎺", tip:"Best viewing: Liberty Square bridge or Main Street hub. Arrive 20 min early." },
    { id:"mk-e2",  name:"Disney Enchantment Fireworks",     type:"fireworks", area:"Main Street U.S.A.", times:["9:00 PM"],                              duration:"18 min",  icon:"🎆", tip:"Center of Main Street or behind the castle. Positions fill 45 min early on busy nights." },
    { id:"mk-e3",  name:"Mickey's Magical Friendship Faire",type:"show",      area:"Cinderella Castle Stage", times:["10:30 AM","12:30 PM","2:00 PM","4:30 PM","6:00 PM"], duration:"20 min", icon:"🎭", tip:"Front row fills fast — arrive 15 min early. Great air conditioning break!" },
    { id:"mk-e4",  name:"Move It! Shake It! Dance Party",   type:"show",      area:"Main Street U.S.A.", times:["11:00 AM","1:30 PM","4:00 PM"],         duration:"15 min",  icon:"🎉", tip:"Fun interactive street party — kids get to dance with characters!" },
    { id:"mk-e5",  name:"Happily Ever After (Projections)",  type:"show",      area:"Cinderella Castle",  times:["8:30 PM"],                             duration:"25 min",  icon:"✨", tip:"Main Street or hub for best castle projections. Check app — schedule varies seasonally." },
    { id:"mk-e6",  name:"Mickey & Minnie Meet & Greet",     type:"character", area:"Town Square Theater", times:["9:00 AM","10:00 AM","11:00 AM","1:00 PM","3:00 PM","5:00 PM"], duration:"5 min per family", icon:"🐭", tip:"Use Lightning Lane — standby waits reach 60 min. First thing in the morning is shortest." },
    { id:"mk-e7",  name:"Tinker Bell & Fairy Friends",      type:"character", area:"Fantasyland",         times:["10:00 AM","12:00 PM","2:00 PM","4:00 PM"], duration:"5 min", icon:"🧚", tip:"In Pixie Hollow — a hidden gem with shorter waits than Mickey." },
    { id:"mk-e8",  name:"Flag Retreat Ceremony",            type:"show",      area:"Town Square",         times:["5:00 PM"],                             duration:"20 min",  icon:"🇺🇸", tip:"Often includes a veteran tribute. Genuinely moving and usually crowd-free." },
  ],
  "EPCOT": [
    { id:"ep-e1",  name:"EPCOT Forever / Harmonious",       type:"fireworks", area:"World Showcase Lagoon", times:["9:00 PM"],                           duration:"20 min",  icon:"🎆", tip:"France or Japan pavilion for best views. UK and Canada for uncrowded spots." },
    { id:"ep-e2",  name:"Luminous the Symphony",            type:"show",      area:"World Showcase Lagoon", times:["9:00 PM"],                           duration:"20 min",  icon:"🎇", tip:"Check current schedule — nighttime spectacular varies by season." },
    { id:"ep-e3",  name:"Disney on Broadway Concert",       type:"show",      area:"America Gardens Theatre", times:["5:30 PM","6:45 PM","8:00 PM"],    duration:"25 min",  icon:"🎤", tip:"Free with park admission during EPCOT festivals. Great seated rest break." },
    { id:"ep-e4",  name:"Mariachi Cobre",                   type:"show",      area:"Mexico Pavilion",      times:["12:00 PM","2:30 PM","4:30 PM"],       duration:"30 min",  icon:"🎸", tip:"Authentic mariachi outside the pyramid. Spontaneous and wonderful." },
    { id:"ep-e5",  name:"Off Kilter / Celtic Band",         type:"show",      area:"Canada Pavilion",      times:["12:30 PM","2:30 PM","4:30 PM"],       duration:"25 min",  icon:"🎻", tip:"Cult favorite — energetic and fun. Always a crowd pleaser." },
    { id:"ep-e6",  name:"Voices of Liberty",                type:"show",      area:"America Pavilion",     times:["11:00 AM","12:00 PM","1:30 PM","3:00 PM","4:30 PM"], duration:"15 min", icon:"🎼", tip:"A cappella group inside the rotunda. Incredible acoustics — genuinely stunning." },
    { id:"ep-e7",  name:"Belle & Friends Meet & Greet",     type:"character", area:"France Pavilion",      times:["10:00 AM","11:30 AM","1:30 PM","3:00 PM"], duration:"5 min", icon:"👸", tip:"Belle in her park-exclusive France pavilion setting — beautiful photos." },
    { id:"ep-e8",  name:"Frozen Sing-Along",                type:"show",      area:"World Showcase",       times:["11:15 AM","1:00 PM","2:45 PM","4:30 PM","6:00 PM"], duration:"30 min", icon:"❄️", tip:"Fully seated, air-conditioned, hysterical hosts — great midday break." },
  ],
  "Hollywood Studios": [
    { id:"hs-e1",  name:"Indiana Jones Epic Stunt Spectacular", type:"show",  area:"Echo Lake",            times:["11:00 AM","1:00 PM","3:00 PM","5:00 PM"], duration:"30 min", icon:"🎬", tip:"Sit in the center section — you might get picked for the show! Arrive 20 min early." },
    { id:"hs-e2",  name:"Fantasmic!",                        type:"show",      area:"Hollywood Hills Amphitheater", times:["8:30 PM","10:00 PM"],          duration:"30 min",  icon:"✨", tip:"Book a Fantasmic! dining package for reserved seating. Otherwise arrive 1 hour early." },
    { id:"hs-e3",  name:"Star Wars: A Galactic Spectacular", type:"fireworks", area:"Hollywood Blvd",     times:["9:30 PM"],                              duration:"15 min",  icon:"🚀", tip:"Chinese Theatre or Hollywood Blvd for best projections. Avoid the back of the park." },
    { id:"hs-e4",  name:"Beauty and the Beast Live on Stage", type:"show",    area:"Theater of the Stars",times:["11:00 AM","1:00 PM","3:00 PM","5:00 PM"], duration:"25 min", icon:"🌹", tip:"Shaded outdoor theater — great escape from heat. Full Broadway-style production!" },
    { id:"hs-e5",  name:"For the First Time in Forever: A Frozen Sing-Along", type:"show", area:"Hyperion Theater", times:["10:30 AM","12:30 PM","2:15 PM","4:00 PM","5:30 PM"], duration:"30 min", icon:"❄️", tip:"Fully air conditioned and hilarious. One of the most underrated shows at WDW." },
    { id:"hs-e6",  name:"Citizens of Hollywood",             type:"show",      area:"Hollywood Blvd",      times:["Roaming 10 AM–6 PM"],                  duration:"5–10 min",icon:"🎭", tip:"Improv street performers — spontaneous and very funny. Keep an eye out!" },
    { id:"hs-e7",  name:"Walt Disney Presents",              type:"show",      area:"Hollywood Blvd",      times:["Open 9 AM–8 PM"],                      duration:"Self-paced",icon:"🏛️", tip:"Air-conditioned museum about Walt's life — a hidden gem and great rest stop." },
  ],
  "Animal Kingdom": [
    { id:"ak-e1",  name:"Festival of the Lion King",         type:"show",      area:"Africa",               times:["9:30 AM","11:00 AM","12:30 PM","2:00 PM","3:30 PM","5:00 PM"], duration:"30 min", icon:"🦁", tip:"One of the best shows at WDW. Book Lightning Lane or arrive 30 min early — it fills up!" },
    { id:"ak-e2",  name:"Finding Nemo: The Big Blue",        type:"show",      area:"Discovery Island",     times:["10:00 AM","11:30 AM","1:00 PM","2:30 PM","4:00 PM"], duration:"40 min", icon:"🐠", tip:"Fully air conditioned, beloved by all ages. Great for a midday break." },
    { id:"ak-e3",  name:"Rivers of Light",                   type:"show",      area:"Discovery River",      times:["8:15 PM","9:45 PM"],                   duration:"20 min",  icon:"🌅", tip:"Nighttime spectacular on the river. Dining package available for guaranteed seats." },
    { id:"ak-e4",  name:"UP! A Great Bird Adventure",        type:"show",      area:"Caravan Stage",        times:["10:00 AM","11:30 AM","1:00 PM","2:30 PM","4:00 PM"], duration:"25 min", icon:"🦅", tip:"Live birds of prey with Russell & Dug from UP! Kids go absolutely wild." },
    { id:"ak-e5",  name:"Harambe Wildlife Parti",            type:"show",      area:"Africa",               times:["12:00 PM","2:00 PM","4:00 PM"],         duration:"20 min",  icon:"🥁", tip:"Street party with live drummers and dancers — very high energy and fun." },
    { id:"ak-e6",  name:"Adventurers Outpost",               type:"character", area:"Discovery Island",     times:["8:00 AM–7:00 PM"],                     duration:"5 min",   icon:"🐭", tip:"Mickey & Minnie in safari outfits — unique photo opportunity you can't get elsewhere." },
    { id:"ak-e7",  name:"Donald's Dino-Bash! Meet & Greets", type:"character", area:"DinoLand U.S.A.",      times:["9:00 AM–6:00 PM"],                     duration:"5 min",   icon:"🦕", tip:"Donald, Daisy, Scrooge in dino costumes — quirky and very photogenic." },
  ],
};

const TYPE_STYLE = {
  parade:    { color:"#FF9800", bg:"rgba(255,152,0,.12)",    icon:"🎺" },
  fireworks: { color:"#E040FB", bg:"rgba(224,64,251,.12)",   icon:"🎆" },
  show:      { color:"#4FC3F7", bg:"rgba(79,195,247,.10)",   icon:"🎭" },
  character: { color:"#69F0AE", bg:"rgba(105,240,174,.10)",  icon:"🤝" },
};

function EntertainmentTab({ park }) {
  const events   = ENTERTAINMENT[park] || [];
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(null);
  const now      = new Date();
  const nowMins  = now.getHours() * 60 + now.getMinutes();

  // Parse "HH:MM AM/PM" → total minutes since midnight
  function toMins(str) {
    const m = str.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!m) return null;
    let h = parseInt(m[1]);
    const min = parseInt(m[2]);
    if (m[3].toUpperCase() === "PM" && h !== 12) h += 12;
    if (m[3].toUpperCase() === "AM" && h === 12) h = 0;
    return h * 60 + min;
  }

  // Find next upcoming time for an event
  function nextTime(times) {
    const parsed = times.map(t => ({ raw: t, mins: toMins(t) })).filter(x => x.mins !== null);
    const upcoming = parsed.filter(x => x.mins >= nowMins);
    return upcoming.length ? upcoming[0] : parsed[parsed.length - 1] || null;
  }

  function minutesUntil(mins) {
    const diff = mins - nowMins;
    if (diff <= 0) return null;
    if (diff < 60) return `${diff}m`;
    return `${Math.floor(diff/60)}h ${diff%60}m`;
  }

  const types = ["all","parade","fireworks","show","character"];
  const filtered = filter === "all" ? events : events.filter(e => e.type === filter);

  // Sort: soonest next event first
  const sorted = [...filtered].sort((a, b) => {
    const na = nextTime(a.times);
    const nb = nextTime(b.times);
    if (!na && !nb) return 0;
    if (!na) return 1;
    if (!nb) return -1;
    return (na.mins || 0) - (nb.mins || 0);
  });

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {/* Filter chips */}
      <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
        {types.map(t => {
          const s = t === "all" ? {color:T.gold,bg:"rgba(255,215,0,.12)"} : TYPE_STYLE[t];
          const active = filter === t;
          return (
            <button key={t} onClick={()=>setFilter(t)} style={{
              padding:"6px 14px", borderRadius:20, cursor:"pointer",
              border:`1px solid ${active ? s.color : T.border}`,
              background: active ? s.bg : "transparent",
              color: active ? s.color : T.dim,
              fontFamily:"'Lato',sans-serif", fontSize:11, fontWeight:700,
              textTransform:"capitalize",
            }}>
              {t === "all" ? "⭐ All" : `${TYPE_STYLE[t].icon} ${t.charAt(0).toUpperCase()+t.slice(1)}s`}
            </button>
          );
        })}
        <span style={{marginLeft:"auto",fontSize:10,color:T.dim,fontFamily:"'Lato',sans-serif",alignSelf:"center"}}>
          {sorted.length} events · {park}
        </span>
      </div>

      {/* Event cards */}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {sorted.map(ev => {
          const s    = TYPE_STYLE[ev.type] || TYPE_STYLE.show;
          const next = nextTime(ev.times);
          const until= next?.mins ? minutesUntil(next.mins) : null;
          const isOpen = ev.expand;
          const isPast = next && next.mins !== null && next.mins < nowMins && ev.times.every(t => { const m = toMins(t); return m !== null && m < nowMins; });

          return (
            <div key={ev.id} style={{
              background:T.card, border:`1px solid ${expanded===ev.id ? s.color : T.border}`,
              borderRadius:14, overflow:"hidden",
              opacity: isPast ? 0.5 : 1,
              transition:"border-color .2s",
            }}>
              {/* Header row */}
              <div onClick={()=>setExpanded(expanded===ev.id ? null : ev.id)}
                style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",cursor:"pointer"}}>
                {/* Type badge */}
                <div style={{width:36,height:36,borderRadius:10,background:s.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>
                  {ev.icon}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,color:T.text,fontFamily:"'Lato',sans-serif",marginBottom:2}}>{ev.name}</div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                    <span style={{fontSize:9,padding:"1px 7px",borderRadius:8,background:s.bg,color:s.color,fontFamily:"'Lato',sans-serif",fontWeight:700,textTransform:"uppercase"}}>{ev.type}</span>
                    <span style={{fontSize:10,color:T.dim,fontFamily:"'Lato',sans-serif"}}>📍 {ev.area}</span>
                    <span style={{fontSize:10,color:T.dim,fontFamily:"'Lato',sans-serif"}}>⏱ {ev.duration}</span>
                  </div>
                </div>
                {/* Next time + countdown */}
                <div style={{textAlign:"right",flexShrink:0}}>
                  {next && !isPast ? (
                    <>
                      <div style={{fontSize:12,fontFamily:"'Cinzel',serif",color:s.color,fontWeight:700}}>{next.raw}</div>
                      {until && <div style={{fontSize:10,color:T.green,fontFamily:"'Lato',sans-serif"}}>in {until}</div>}
                    </>
                  ) : (
                    <div style={{fontSize:10,color:T.dim,fontFamily:"'Lato',sans-serif"}}>{isPast?"Ended today":"See times →"}</div>
                  )}
                </div>
                <div style={{color:T.dim,fontSize:12,marginLeft:4}}>{expanded===ev.id?"▲":"▼"}</div>
              </div>

              {/* Expanded detail */}
              {expanded===ev.id && (
                <div style={{padding:"0 16px 14px",borderTop:`1px solid ${T.border}20`,animation:"slideIn .2s ease"}}>
                  {/* All show times */}
                  <div style={{marginTop:10,marginBottom:10}}>
                    <div style={{fontSize:9,color:T.dim,textTransform:"uppercase",letterSpacing:1.5,fontFamily:"'Lato',sans-serif",marginBottom:6}}>All Show Times Today</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                      {ev.times.map(t => {
                        const m = toMins(t);
                        const past = m !== null && m < nowMins;
                        const isNext = next && next.raw === t;
                        return (
                          <span key={t} style={{
                            fontSize:11,padding:"4px 10px",borderRadius:20,fontFamily:"'Lato',sans-serif",fontWeight:700,
                            background: isNext ? s.bg : "rgba(255,255,255,.04)",
                            color: isNext ? s.color : past ? T.dim : T.text,
                            border:`1px solid ${isNext ? s.color : T.border}`,
                            textDecoration: past ? "line-through" : "none",
                            opacity: past ? 0.5 : 1,
                          }}>{t}{isNext?" ← next":""}</span>
                        );
                      })}
                    </div>
                  </div>
                  {/* Tip */}
                  <div style={{background:`${s.bg}`,border:`1px solid ${s.color}30`,borderRadius:9,padding:"10px 12px",display:"flex",gap:8}}>
                    <span style={{color:T.gold,flexShrink:0}}>💡</span>
                    <span style={{fontSize:12,color:T.text,fontFamily:"'Lato',sans-serif",lineHeight:1.6}}>{ev.tip}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{textAlign:"center",fontSize:10,color:T.dim,fontFamily:"'Lato',sans-serif"}}>
        Times are approximate · Always verify in the My Disney Experience app · Schedules vary seasonally
      </div>
    </div>
  );
}

// ─── DINING AVAILABILITY ──────────────────────────────────────────────────────
const DINING_DATA = {
  "Magic Kingdom": [
    { id:"mk-d1",  name:"Be Our Guest Restaurant",    type:"table",  area:"Fantasyland",    cuisine:"French",         priceRange:"$$$", avgWait:0,  popularItems:["Grey Stuff (it's delicious!)","Braised Pork","French Onion Soup"], tip:"Dinner is table service; lunch is quick service. Book 60 days out — hardest reservation in WDW.", reservationNeeded:true,  mobileOrder:false, indoorSeating:true,  characterDining:false },
    { id:"mk-d2",  name:"Cinderella's Royal Table",   type:"table",  area:"Cinderella Castle",cuisine:"American",      priceRange:"$$$$",avgWait:0,  popularItems:["Filet Mignon","Pan-seared Grouper","Royal dessert platter"], tip:"Breakfast is easiest to book. Comes with character visits from Cinderella and friends.", reservationNeeded:true,  mobileOrder:false, indoorSeating:true,  characterDining:true  },
    { id:"mk-d3",  name:"The Plaza Restaurant",       type:"table",  area:"Main Street",    cuisine:"American",       priceRange:"$$",  avgWait:0,  popularItems:["Plaza Club Sandwich","Grilled Reuben","Milkshakes"], tip:"Often overlooked — pleasant indoor dining on Main Street with shorter booking windows.", reservationNeeded:true,  mobileOrder:false, indoorSeating:true,  characterDining:false },
    { id:"mk-d4",  name:"Liberty Tree Tavern",        type:"table",  area:"Liberty Square",  cuisine:"American",      priceRange:"$$$", avgWait:0,  popularItems:["Pilgrim's Feast (turkey, stuffing, pot roast)","Ooey Gooey Toffee Cake"], tip:"All-you-care-to-enjoy dinner. Great value for hungry families. Colonial atmosphere.", reservationNeeded:true,  mobileOrder:false, indoorSeating:true,  characterDining:false },
    { id:"mk-d5",  name:"Jungle Navigation Co. Skipper Canteen", type:"table", area:"Adventureland", cuisine:"Global", priceRange:"$$$", avgWait:0, popularItems:["Schweitzer Salad","Falls Family Falafel","Trader Sam's Grog Grotto cocktails"], tip:"Themed to the Jungle Cruise — funny menus and themed decor. Usually easier to book than Be Our Guest.", reservationNeeded:true, mobileOrder:false, indoorSeating:true, characterDining:false },
    { id:"mk-d6",  name:"Pecos Bill Tall Tale Inn",   type:"quick",  area:"Frontierland",   cuisine:"Tex-Mex",        priceRange:"$",   avgWait:15, popularItems:["Loaded Fries","Burrito Bowl","Nachos"], tip:"Huge toppings bar — pile on as much as you want for no extra charge. Great value quick service.", reservationNeeded:false, mobileOrder:true,  indoorSeating:true,  characterDining:false },
    { id:"mk-d7",  name:"Columbia Harbour House",     type:"quick",  area:"Liberty Square",  cuisine:"Seafood",       priceRange:"$",   avgWait:12, popularItems:["Lobster Roll","New England Clam Chowder","Fried Fish Platter"], tip:"Best kept secret in Magic Kingdom — clam chowder in bread bowl is outstanding. Almost never crowded.", reservationNeeded:false, mobileOrder:true,  indoorSeating:true,  characterDining:false },
    { id:"mk-d8",  name:"Sleepy Hollow Refreshments", type:"snack",  area:"Liberty Square",  cuisine:"Snacks",        priceRange:"$",   avgWait:8,  popularItems:["Funnel Cake Waffle","Sweet & Spicy Chicken Waffle","Fresh Fruit Waffle"], tip:"Famous for giant waffles. The sweet & spicy chicken waffle is a must-try Disney snack.", reservationNeeded:false, mobileOrder:false, indoorSeating:false, characterDining:false },
    { id:"mk-d9",  name:"Aloha Isle",                 type:"snack",  area:"Adventureland",   cuisine:"Snacks",        priceRange:"$",   avgWait:10, popularItems:["Dole Whip Float","Dole Whip Soft Serve","Pineapple Juice"], tip:"THE iconic Disney snack. Dole Whip Float is the move — float > soft serve. Line moves fast.", reservationNeeded:false, mobileOrder:false, indoorSeating:false, characterDining:false },
  ],
  "EPCOT": [
    { id:"ep-d1",  name:"Space 220 Restaurant",       type:"table",  area:"World Discovery", cuisine:"American/Space", priceRange:"$$$$",avgWait:0,  popularItems:["Comet Cocktail","Celestial Salad","Pan-Roasted Chicken","Starfield Dessert"], tip:"Elevator ride takes you to a 'space station' 220 miles above Earth. Incredible theming. Book immediately at 60-day window.", reservationNeeded:true,  mobileOrder:false, indoorSeating:true,  characterDining:false },
    { id:"ep-d2",  name:"Le Cellier Steakhouse",      type:"table",  area:"Canada Pavilion",  cuisine:"Canadian",     priceRange:"$$$$",avgWait:0,  popularItems:["Canadian Cheddar Cheese Soup","Filet Mignon","Le Cellier Mushroom Filet"], tip:"Consistently rated #1 restaurant at EPCOT. The cheese soup is legendary. Very hard to book — try 60 days out.", reservationNeeded:true,  mobileOrder:false, indoorSeating:true,  characterDining:false },
    { id:"ep-d3",  name:"Teppan Edo",                 type:"table",  area:"Japan Pavilion",   cuisine:"Japanese",     priceRange:"$$$", avgWait:0,  popularItems:["Wagyu Beef","Shrimp & Steak","Vegetable Teppanyaki"], tip:"Hibachi-style cooking show at your table. Great for groups — chefs are entertaining and food is excellent.", reservationNeeded:true,  mobileOrder:false, indoorSeating:true,  characterDining:false },
    { id:"ep-d4",  name:"Biergarten Restaurant",      type:"table",  area:"Germany Pavilion", cuisine:"German",       priceRange:"$$$", avgWait:0,  popularItems:["Bratwurst","Rotisserie Chicken","Schnitzel","German Beer"], tip:"All-you-care-to-enjoy buffet with live oompah band. Communal seating — you'll share tables with strangers (fun!)", reservationNeeded:true,  mobileOrder:false, indoorSeating:true,  characterDining:false },
    { id:"ep-d5",  name:"Chefs de France",            type:"table",  area:"France Pavilion",  cuisine:"French",       priceRange:"$$$", avgWait:0,  popularItems:["French Onion Soup","Croque Monsieur","Crème Brûlée","Quiche Lorraine"], tip:"Authentic Parisian brasserie atmosphere. Easier to get than many EPCOT restaurants. Great for a relaxed lunch.", reservationNeeded:true,  mobileOrder:false, indoorSeating:true,  characterDining:false },
    { id:"ep-d6",  name:"Akershus Royal Banquet Hall", type:"table", area:"Norway Pavilion",  cuisine:"Scandinavian", priceRange:"$$$", avgWait:0,  popularItems:["Princess character breakfast","Kjøttkaker (meatballs)","Rømmegrøt (porridge)"], tip:"Character dining with Disney princesses! Usually easier to book than Cinderella's Royal Table. Breakfast is best value.", reservationNeeded:true,  mobileOrder:false, indoorSeating:true,  characterDining:true  },
    { id:"ep-d7",  name:"Regal Eagle Smokehouse",      type:"quick", area:"America Pavilion",  cuisine:"BBQ",          priceRange:"$$",  avgWait:18, popularItems:["BBQ Brisket Platter","Pulled Pork Sandwich","Smoked Half Chicken","Mac & Cheese"], tip:"Best BBQ on Disney property. Huge portions. Mobile order is a must — lines get very long at lunch.", reservationNeeded:false, mobileOrder:true,  indoorSeating:true,  characterDining:false },
    { id:"ep-d8",  name:"Katsura Grill",               type:"quick", area:"Japan Pavilion",    cuisine:"Japanese",    priceRange:"$$",  avgWait:14, popularItems:["Udon Noodle Bowl","Teriyaki Chicken","Tempura","Matcha Soft Serve"], tip:"Hidden gem. Outdoor seating overlooks the lagoon. Matcha soft serve is one of the best treats in EPCOT.", reservationNeeded:false, mobileOrder:false, indoorSeating:false, characterDining:false },
    { id:"ep-d9",  name:"L'Artisan des Glaces",        type:"snack", area:"France Pavilion",    cuisine:"Ice Cream",  priceRange:"$",   avgWait:10, popularItems:["Macaron Ice Cream Sandwich","Rose Wine Ice Cream","Caramel Gelato"], tip:"Artisan ice cream and sorbet. The macaron sandwich is Instagram-famous for a reason. Adults: try the wine ice cream!", reservationNeeded:false, mobileOrder:false, indoorSeating:false, characterDining:false },
  ],
  "Hollywood Studios": [
    { id:"hs-d1",  name:"Hollywood Brown Derby",       type:"table",  area:"Hollywood Blvd",  cuisine:"American",     priceRange:"$$$$",avgWait:0,  popularItems:["Cobb Salad (original recipe)","Grapefruit Cake","Seared Salmon"], tip:"Replica of the famous 1930s Hollywood restaurant. Cobb salad was invented here — worth ordering. Great for a special meal.", reservationNeeded:true,  mobileOrder:false, indoorSeating:true,  characterDining:false },
    { id:"hs-d2",  name:"Sci-Fi Dine-In Theater",      type:"table",  area:"Commissary Lane", cuisine:"American",     priceRange:"$$$", avgWait:0,  popularItems:["Alien Shake","BBQ Brisket","Carrot Cake"], tip:"Eat in vintage cars watching 1950s sci-fi B-movies! More about the experience than the food. Still great fun.", reservationNeeded:true,  mobileOrder:false, indoorSeating:true,  characterDining:false },
    { id:"hs-d3",  name:"50's Prime Time Café",         type:"table", area:"Echo Lake",        cuisine:"American",     priceRange:"$$$", avgWait:0,  popularItems:["Fried Chicken","Pot Roast","PB&J Milkshake","Dad's Brownie Sundae"], tip:"Servers act as your aunt/mom nagging you to eat your veggies and get off the phone. Hysterical for families.", reservationNeeded:true,  mobileOrder:false, indoorSeating:true,  characterDining:false },
    { id:"hs-d4",  name:"Oga's Cantina",                type:"bar",   area:"Galaxy's Edge",    cuisine:"Drinks",      priceRange:"$$",  avgWait:0,  popularItems:["Fuzzy Tauntaun","Jedi Mind Trick","Carbon Freeze (non-alcoholic)","Yub Nub"], tip:"Standing room only bar in Star Wars land. DJ R-3X spins the tunes. Book it — walk-ups are nearly impossible.", reservationNeeded:true,  mobileOrder:false, indoorSeating:false, characterDining:false },
    { id:"hs-d5",  name:"Docking Bay 7 Food and Cargo", type:"quick", area:"Galaxy's Edge",   cuisine:"Galactic",     priceRange:"$$",  avgWait:16, popularItems:["Smoked Kaadu Ribs","Fried Endorian Tip-Yip (chicken)","Ronto Wrap"], tip:"Excellent quick service in Galaxy's Edge. Ronto Wrap is a fan favorite — pulled pork in a pita-style bread.", reservationNeeded:false, mobileOrder:true,  indoorSeating:true,  characterDining:false },
    { id:"hs-d6",  name:"Woody's Lunch Box",            type:"quick", area:"Toy Story Land",  cuisine:"American",     priceRange:"$",   avgWait:20, popularItems:["Totchos (tater tot nachos)","BBQ Brisket Melt","Lemon Icebox Smoothie"], tip:"Totchos are a Disney legend. Tiny walk-up window — mobile order is essential. No indoor seating.", reservationNeeded:false, mobileOrder:true,  indoorSeating:false, characterDining:false },
    { id:"hs-d7",  name:"Ronto Roasters",               type:"snack", area:"Galaxy's Edge",   cuisine:"Snacks",       priceRange:"$",   avgWait:10, popularItems:["Ronto Wrap","Ronto-Less Wrap (vegetarian)","Meiloorun Juice"], tip:"The rotating spit outside is actually a pod racer engine. Ronto Wraps are some of the best park food anywhere.", reservationNeeded:false, mobileOrder:false, indoorSeating:false, characterDining:false },
  ],
  "Animal Kingdom": [
    { id:"ak-d1",  name:"Tiffins Restaurant",           type:"table", area:"Discovery Island", cuisine:"Global",      priceRange:"$$$$",avgWait:0,  popularItems:["Whole Fried Sustainable Fish","Slow-Braised Beef Short Rib","South African Bobotie"], tip:"Disney's most underrated signature restaurant. Inspired by Joe Rohde's travel journals. Incredible food and atmosphere.", reservationNeeded:true,  mobileOrder:false, indoorSeating:true,  characterDining:false },
    { id:"ak-d2",  name:"Yak & Yeti Restaurant",        type:"table", area:"Asia",             cuisine:"Asian",       priceRange:"$$$", avgWait:0,  popularItems:["Ahi Tuna Nachos","Honey Chicken","Lo Mein","Crispy Mahi Mahi"], tip:"Pan-Asian menu in a richly decorated lodge. Ahi tuna nachos are legendary. Usually easy to book day-of.", reservationNeeded:true,  mobileOrder:false, indoorSeating:true,  characterDining:false },
    { id:"ak-d3",  name:"Tusker House Restaurant",      type:"table", area:"Africa",           cuisine:"African",     priceRange:"$$$", avgWait:0,  popularItems:["Character breakfast with Donald","Jungle Juice","African-inspired buffet"], tip:"Donald Duck and friends in safari gear! The buffet is outstanding — especially the hummus, salads, and carved meats.", reservationNeeded:true,  mobileOrder:false, indoorSeating:true,  characterDining:true  },
    { id:"ak-d4",  name:"Satu'li Canteen",               type:"quick", area:"Pandora",         cuisine:"Pandoran",    priceRange:"$$",  avgWait:18, popularItems:["Cheeseburger Pods","Grilled Chicken Bowl","Blueberry Cream Cheese Mousse"], tip:"Best quick service at Animal Kingdom. Blueberry mousse dessert is one of the best items in any Disney park.", reservationNeeded:false, mobileOrder:true,  indoorSeating:true,  characterDining:false },
    { id:"ak-d5",  name:"Flame Tree Barbecue",           type:"quick", area:"Discovery Island", cuisine:"BBQ",        priceRange:"$$",  avgWait:15, popularItems:["Ribs & Chicken Combo","Pulled Pork Sandwich","Onion Rings"], tip:"Outdoor seating with incredible views of the water and Expedition Everest. Best outdoor dining setting in AK.", reservationNeeded:false, mobileOrder:true,  indoorSeating:false, characterDining:false },
    { id:"ak-d6",  name:"Harambe Market",                type:"quick", area:"Africa",          cuisine:"African Street Food", priceRange:"$", avgWait:12, popularItems:["Ribs & Chicken","Corn on the Cob","African-spiced Chicken Wings"], tip:"Outdoor African street market feel. Multiple windows for different items — split up to grab different dishes faster.", reservationNeeded:false, mobileOrder:false, indoorSeating:false, characterDining:false },
    { id:"ak-d7",  name:"Pongu Pongu",                   type:"snack", area:"Pandora",         cuisine:"Snacks",      priceRange:"$",   avgWait:8,  popularItems:["Night Blossom (non-alcoholic)","Pongu Lumpia (cream cheese egg roll)","Mo'ara Margarita"], tip:"Night Blossom drink is a must — frozen passion fruit limeade with boba. Pongu Lumpia is a perfect snack stop.", reservationNeeded:false, mobileOrder:false, indoorSeating:false, characterDining:false },
  ],
};

const DINING_TYPE_STYLE = {
  table:  { color:"#FFD700", bg:"rgba(255,215,0,.1)",    icon:"🍽️",  label:"Table Service"  },
  quick:  { color:"#69F0AE", bg:"rgba(105,240,174,.1)",  icon:"🥡",  label:"Quick Service"  },
  snack:  { color:"#FFB74D", bg:"rgba(255,183,77,.1)",   icon:"🍦",  label:"Snack / Treat"  },
  bar:    { color:"#B388FF", bg:"rgba(179,136,255,.1)",  icon:"🍸",  label:"Bar / Lounge"   },
};

function DiningTab({ park, backendOnline }) {
  const options   = DINING_DATA[park] || [];
  const [filter, setFilter]       = useState("all");
  const [expanded, setExpanded]   = useState(null);
  const [checkLoading, setCheckLoading] = useState(null);
  const [availability, setAvailability] = useState({});  // id → { slots, checked }
  const [partySize, setPartySize] = useState("4");
  const [mealTime, setMealTime]   = useState("12:00 PM");

  const types = ["all","table","quick","snack","bar"];
  const filtered = filter==="all" ? options : options.filter(d=>d.type===filter);

  // Ask Claude to check/suggest availability (simulated — real impl needs Disney API OAuth)
  const checkAvailability = async (dining) => {
    setCheckLoading(dining.id);
    try {
      const prompt = `You are a Disney World dining expert. Give a realistic same-day availability assessment for ${dining.name} at ${park}.
Party size: ${partySize} | Requested time: ${mealTime} | Today's date: ${new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}

Based on your knowledge of this restaurant's typical booking patterns and demand, provide:
1. Likelihood of same-day availability (High/Medium/Low/Very Low)
2. Best alternative times to check (3 specific times)
3. One insider tip to get a table
4. Whether walk-up waitlist is worth trying

Respond ONLY as JSON: {"likelihood":"Medium","reason":"brief reason","alternateTimes":["11:30 AM","1:30 PM","3:00 PM"],"insiderTip":"tip text","walkUpWorth":true}`;

      let reply = "";
      if (backendOnline) {
        const r = await fetch(`${API_BASE}/api/chat`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({messages:[{role:"user",content:prompt}],park,visitDay:"today"}) });
        const d = await r.json(); reply = d.reply;
      } else {
        const r = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:400,messages:[{role:"user",content:prompt}]})});
        const d = await r.json(); reply = d.content?.[0]?.text||"{}";
      }
      const data = JSON.parse(reply.replace(/```json|```/g,"").trim());
      setAvailability(prev=>({...prev,[dining.id]:{...data,checked:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}}));
    } catch(e) {
      setAvailability(prev=>({...prev,[dining.id]:{likelihood:"Unknown",reason:"Could not check — try the My Disney Experience app.",alternateTimes:[],insiderTip:"",walkUpWorth:false,checked:"error"}}));
    }
    setCheckLoading(null);
  };

  const likelihoodColor = { High:T.green, Medium:T.gold, Low:T.orange, "Very Low":T.pink, Unknown:T.dim };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>

      {/* Search bar */}
      <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:16}}>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:11,color:T.orange,letterSpacing:1,marginBottom:12}}>🍽️ DINING FINDER</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 100px 120px",gap:8}}>
          <div>
            <div style={{fontSize:9,color:T.dim,textTransform:"uppercase",letterSpacing:1.5,marginBottom:4,fontFamily:"'Lato',sans-serif"}}>Meal Time</div>
            <select value={mealTime} onChange={e=>setMealTime(e.target.value)} style={{width:"100%",background:"#11112b",border:`1px solid ${T.border}`,borderRadius:8,color:T.gold,fontSize:12,padding:"8px 10px",fontFamily:"'Lato',sans-serif",cursor:"pointer"}}>
              {["8:00 AM","9:00 AM","10:00 AM","11:00 AM","11:30 AM","12:00 PM","12:30 PM","1:00 PM","1:30 PM","2:00 PM","3:00 PM","4:00 PM","5:00 PM","5:30 PM","6:00 PM","6:30 PM","7:00 PM","7:30 PM","8:00 PM","8:30 PM","9:00 PM"].map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <div style={{fontSize:9,color:T.dim,textTransform:"uppercase",letterSpacing:1.5,marginBottom:4,fontFamily:"'Lato',sans-serif"}}>Party Size</div>
            <select value={partySize} onChange={e=>setPartySize(e.target.value)} style={{width:"100%",background:"#11112b",border:`1px solid ${T.border}`,borderRadius:8,color:T.gold,fontSize:12,padding:"8px 10px",fontFamily:"'Lato',sans-serif",cursor:"pointer"}}>
              {["1","2","3","4","5","6","7","8","9","10"].map(n=><option key={n} value={n}>{n} {n==="1"?"person":"people"}</option>)}
            </select>
          </div>
          <div>
            <div style={{fontSize:9,color:T.dim,textTransform:"uppercase",letterSpacing:1.5,marginBottom:4,fontFamily:"'Lato',sans-serif"}}>Type</div>
            <select value={filter} onChange={e=>setFilter(e.target.value)} style={{width:"100%",background:"#11112b",border:`1px solid ${T.border}`,borderRadius:8,color:T.gold,fontSize:12,padding:"8px 10px",fontFamily:"'Lato',sans-serif",cursor:"pointer"}}>
              <option value="all">All types</option>
              {types.filter(t=>t!=="all").map(t=><option key={t} value={t}>{DINING_TYPE_STYLE[t]?.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Type filter chips */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {types.map(t=>{
          const s = t==="all"?{color:T.gold,bg:"rgba(255,215,0,.1)"}:DINING_TYPE_STYLE[t];
          const active = filter===t;
          return <button key={t} onClick={()=>setFilter(t)} style={{padding:"5px 13px",borderRadius:20,cursor:"pointer",border:`1px solid ${active?s.color:T.border}`,background:active?s.bg:"transparent",color:active?s.color:T.dim,fontFamily:"'Lato',sans-serif",fontSize:11,fontWeight:700}}>
            {t==="all"?"🍴 All":`${DINING_TYPE_STYLE[t]?.icon} ${DINING_TYPE_STYLE[t]?.label}`}
          </button>;
        })}
        <span style={{marginLeft:"auto",fontSize:10,color:T.dim,fontFamily:"'Lato',sans-serif",alignSelf:"center"}}>{filtered.length} options</span>
      </div>

      {/* Restaurant cards */}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {filtered.map(dining=>{
          const s   = DINING_TYPE_STYLE[dining.type] || DINING_TYPE_STYLE.quick;
          const avail = availability[dining.id];
          const isExpanded = expanded===dining.id;
          return (
            <div key={dining.id} style={{background:T.card,border:`1px solid ${isExpanded?s.color:T.border}`,borderRadius:14,overflow:"hidden",transition:"border-color .2s"}}>
              {/* Header */}
              <div onClick={()=>setExpanded(isExpanded?null:dining.id)} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",cursor:"pointer"}}>
                <div style={{width:36,height:36,borderRadius:10,background:s.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{s.icon}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,color:T.text,fontFamily:"'Lato',sans-serif",marginBottom:2}}>{dining.name}</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                    <span style={{fontSize:9,padding:"1px 6px",borderRadius:7,background:s.bg,color:s.color,fontFamily:"'Lato',sans-serif",fontWeight:700}}>{s.label}</span>
                    <span style={{fontSize:10,color:T.dim,fontFamily:"'Lato',sans-serif"}}>📍 {dining.area}</span>
                    <span style={{fontSize:10,color:T.dim,fontFamily:"'Lato',sans-serif"}}>🍴 {dining.cuisine}</span>
                    <span style={{fontSize:10,color:T.gold,fontFamily:"'Lato',sans-serif"}}>{dining.priceRange}</span>
                    {dining.characterDining && <span style={{fontSize:9,padding:"1px 6px",borderRadius:7,background:"rgba(179,136,255,.15)",color:T.purple,fontFamily:"'Lato',sans-serif",fontWeight:700}}>👸 Characters</span>}
                    {dining.mobileOrder && <span style={{fontSize:9,padding:"1px 6px",borderRadius:7,background:"rgba(105,240,174,.12)",color:T.green,fontFamily:"'Lato',sans-serif",fontWeight:700}}>📱 Mobile Order</span>}
                  </div>
                </div>
                {avail && (
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{fontSize:11,fontWeight:700,color:likelihoodColor[avail.likelihood]||T.dim,fontFamily:"'Lato',sans-serif"}}>{avail.likelihood}</div>
                    <div style={{fontSize:9,color:T.dim,fontFamily:"'Lato',sans-serif"}}>avail.</div>
                  </div>
                )}
                <div style={{color:T.dim,fontSize:12,marginLeft:4}}>{isExpanded?"▲":"▼"}</div>
              </div>

              {/* Expanded */}
              {isExpanded && (
                <div style={{padding:"0 16px 16px",borderTop:`1px solid ${T.border}20`,animation:"slideIn .2s ease"}}>
                  {/* Popular items */}
                  <div style={{marginTop:12,marginBottom:12}}>
                    <div style={{fontSize:9,color:T.dim,textTransform:"uppercase",letterSpacing:1.5,fontFamily:"'Lato',sans-serif",marginBottom:6}}>Must-Try Items</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                      {dining.popularItems.map((item,i)=>(
                        <span key={i} style={{fontSize:11,padding:"3px 10px",borderRadius:20,background:s.bg,color:s.color,fontFamily:"'Lato',sans-serif",border:`1px solid ${s.color}30`}}>🌟 {item}</span>
                      ))}
                    </div>
                  </div>

                  {/* Tip */}
                  <div style={{background:"rgba(255,215,0,.06)",border:"1px solid rgba(255,215,0,.15)",borderRadius:9,padding:"10px 12px",marginBottom:12,display:"flex",gap:8}}>
                    <span style={{color:T.gold,flexShrink:0}}>💡</span>
                    <span style={{fontSize:12,color:T.text,fontFamily:"'Lato',sans-serif",lineHeight:1.6}}>{dining.tip}</span>
                  </div>

                  {/* Availability check */}
                  {dining.type==="table" || dining.type==="bar" ? (
                    <div>
                      <button onClick={()=>checkAvailability(dining)} disabled={checkLoading===dining.id} style={{width:"100%",padding:"10px",background:`linear-gradient(135deg,${s.bg},rgba(79,195,247,.1))`,border:`1px solid ${s.color}`,borderRadius:8,color:s.color,fontFamily:"'Cinzel',serif",fontSize:11,fontWeight:700,cursor:checkLoading===dining.id?"not-allowed":"pointer",letterSpacing:.5,marginBottom:avail?10:0}}>
                        {checkLoading===dining.id?"🤖 Checking with AI…":`🔍 CHECK SAME-DAY AVAILABILITY (${partySize} guests, ${mealTime})`}
                      </button>
                      {avail && (
                        <div style={{background:"rgba(255,255,255,.03)",border:`1px solid ${T.border}`,borderRadius:10,padding:14,animation:"slideIn .2s ease"}}>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                            <span style={{fontSize:12,fontWeight:700,color:likelihoodColor[avail.likelihood]||T.dim,fontFamily:"'Lato',sans-serif"}}>Availability: {avail.likelihood}</span>
                            <span style={{fontSize:9,color:T.dim,fontFamily:"'Lato',sans-serif"}}>Checked {avail.checked}</span>
                          </div>
                          <div style={{fontSize:12,color:T.text,fontFamily:"'Lato',sans-serif",marginBottom:8,lineHeight:1.6}}>{avail.reason}</div>
                          {avail.alternateTimes?.length>0 && (
                            <div style={{marginBottom:8}}>
                              <div style={{fontSize:9,color:T.dim,textTransform:"uppercase",letterSpacing:1.5,fontFamily:"'Lato',sans-serif",marginBottom:5}}>Try These Times Instead</div>
                              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                                {avail.alternateTimes.map(t=><span key={t} style={{fontSize:11,padding:"3px 9px",borderRadius:20,background:"rgba(79,195,247,.1)",color:T.blue,fontFamily:"'Lato',sans-serif",border:"1px solid rgba(79,195,247,.2)"}}>{t}</span>)}
                              </div>
                            </div>
                          )}
                          {avail.insiderTip && <div style={{fontSize:11,color:T.text,fontFamily:"'Lato',sans-serif",lineHeight:1.6,marginBottom:6}}><span style={{color:T.purple}}>🎯 </span>{avail.insiderTip}</div>}
                          {avail.walkUpWorth && <div style={{fontSize:11,color:T.green,fontFamily:"'Lato',sans-serif"}}>✓ Walk-up waitlist is worth trying today</div>}
                          <div style={{marginTop:10,padding:"8px 12px",background:"rgba(255,215,0,.06)",borderRadius:8,fontSize:10,color:T.gold,fontFamily:"'Lato',sans-serif"}}>
                            📱 Book via: My Disney Experience app → Dining → {dining.name}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{padding:"8px 12px",background:"rgba(105,240,174,.06)",border:"1px solid rgba(105,240,174,.15)",borderRadius:8,fontSize:11,color:T.green,fontFamily:"'Lato',sans-serif",display:"flex",gap:8}}>
                      <span>✓</span>
                      <span>{dining.mobileOrder?"Mobile Order available — open the My Disney Experience app to order ahead and skip the line.":"Walk up and order — no reservation needed. "+dining.type==="snack"?"Perfect for a quick treat!":"Quick service, no wait for seating."}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{textAlign:"center",fontSize:10,color:T.dim,fontFamily:"'Lato',sans-serif"}}>
        AI availability is an estimate based on historical patterns · Always book via the My Disney Experience app · Prices may vary
      </div>
    </div>
  );
}

// ─── GROUP LOCATION SHARING ───────────────────────────────────────────────────
// Uses the backend as a simple shared key-value store so family members
// can see each other's locations in real time (polling every 15 seconds)
const GROUP_LOCATIONS_KEY = "disney_group_";

function LocationTab({ park, backendOnline }) {
  const [myName, setMyName]         = useState(() => localStorage.getItem("disney_my_name") || "");
  const [groupCode, setGroupCode]   = useState(() => localStorage.getItem("disney_group_code") || "");
  const [myStatus, setMyStatus]     = useState("");
  const [myArea, setMyArea]         = useState("Entrance");
  const [members, setMembers]       = useState([]);
  const [joined, setJoined]         = useState(false);
  const [sharing, setSharing]       = useState(false);
  const [lastSync, setLastSync]     = useState(null);
  const pollRef                     = useRef(null);
  const myId                        = useRef(localStorage.getItem("disney_my_id") || `member_${Date.now()}`);

  useEffect(() => { localStorage.setItem("disney_my_id", myId.current); }, []);

  const PARK_AREAS = {
    "Magic Kingdom":    ["Entrance/Main Street","Tomorrowland","Fantasyland","Liberty Square","Frontierland","Adventureland","Fantasy Faire","Near Cinderella Castle","Dining","Resort Hotel","First Aid"],
    "EPCOT":            ["Entrance","World Discovery","World Nature","World Celebration","World Showcase","Mexico","Norway","China","Germany","Italy","America","Japan","Morocco","France","UK","Canada","Dining","Near Spaceship Earth"],
    "Hollywood Studios":["Entrance","Hollywood Blvd","Echo Lake","Grand Ave","Star Wars: Galaxy's Edge","Toy Story Land","Sunset Boulevard","Animation Courtyard","Dining"],
    "Animal Kingdom":   ["Entrance","Discovery Island","Africa","Asia","Pandora","DinoLand U.S.A.","Rafiki's Planet Watch","Dining","Near Tree of Life"],
  };

  const areas = PARK_AREAS[park] || ["Entrance","Main Area","Dining","Restrooms","Shop"];

  const STATUS_EMOJIS = ["🎢 On a ride","🍽️ Eating","🛍️ Shopping","🚻 Restroom break","📸 Taking photos","😴 Taking a break","🎭 At a show","🚶 Walking to next ride","📱 Checking the app","🤝 Meeting a character","💦 Getting water","🧴 Sunscreen stop"];

  // Broadcast my location via backend (stored as a simple JSON blob)
  const pushLocation = useCallback(async () => {
    if (!backendOnline || !joined) return;
    try {
      await fetch(`${API_BASE}/api/location/push`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          groupCode, memberId: myId.current,
          name: myName, area: myArea,
          status: myStatus, park,
          ts: Date.now(),
        }),
      });
    } catch {}
  }, [backendOnline, joined, groupCode, myName, myArea, myStatus, park]);

  // Pull all group members' locations
  const pullLocations = useCallback(async () => {
    if (!backendOnline || !joined) return;
    try {
      const r = await fetch(`${API_BASE}/api/location/group/${groupCode}`);
      const d = await r.json();
      if (d.members) {
        setMembers(d.members.filter(m => m.memberId !== myId.current && Date.now() - m.ts < 5 * 60 * 1000));
        setLastSync(new Date());
      }
    } catch {}
  }, [backendOnline, joined, groupCode]);

  useEffect(() => {
    if (!joined) return;
    pushLocation();
    pullLocations();
    pollRef.current = setInterval(() => { pushLocation(); pullLocations(); }, 15000);
    return () => clearInterval(pollRef.current);
  }, [joined, pushLocation, pullLocations]);

  const joinGroup = () => {
    if (!myName.trim() || !groupCode.trim()) return;
    localStorage.setItem("disney_my_name", myName);
    localStorage.setItem("disney_group_code", groupCode);
    setJoined(true);
  };

  const leaveGroup = () => {
    setJoined(false);
    clearInterval(pollRef.current);
    setMembers([]);
  };

  const generateCode = () => {
    const code = Math.random().toString(36).slice(2,7).toUpperCase();
    setGroupCode(code);
  };

  // Time since last seen
  const timeSince = (ts) => {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s/60)}m ago`;
    return `${Math.floor(s/3600)}h ago`;
  };

  const AREA_EMOJI = {
    "Entrance":"🚪","Entrance/Main Street":"🏰","Tomorrowland":"🚀","Fantasyland":"🏰","Liberty Square":"🗽",
    "Frontierland":"🤠","Adventureland":"🌴","Near Cinderella Castle":"🏰","Star Wars: Galaxy's Edge":"🚀",
    "Toy Story Land":"🧸","Sunset Boulevard":"🎬","Pandora":"🌌","Africa":"🦁","Asia":"🐘",
    "DinoLand U.S.A.":"🦕","Discovery Island":"🌿","World Discovery":"🔬","World Nature":"🌊",
    "World Showcase":"🌍","Dining":"🍽️","Resort Hotel":"🏨","First Aid":"💊","Restrooms":"🚻",
  };

  if (!joined) return (
    <div style={{display:"flex",flexDirection:"column",gap:14,maxWidth:480,margin:"0 auto"}}>
      <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:24}}>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:12,color:T.blue,letterSpacing:1,marginBottom:6,textAlign:"center"}}>📍 GROUP LOCATION SHARING</div>
        <div style={{fontSize:12,color:T.dim,fontFamily:"'Lato',sans-serif",textAlign:"center",marginBottom:20,lineHeight:1.6}}>
          Share your location within the park with family. No GPS — just tap your current area and status so everyone knows where you are.
        </div>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:9,color:T.dim,textTransform:"uppercase",letterSpacing:1.5,marginBottom:5,fontFamily:"'Lato',sans-serif"}}>Your Name</div>
          <input value={myName} onChange={e=>setMyName(e.target.value)} placeholder="e.g. Dad, Mom, Emma…"
            style={{width:"100%",background:"rgba(255,255,255,.04)",border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:13,padding:"9px 12px",fontFamily:"'Lato',sans-serif"}}/>
        </div>
        <div style={{marginBottom:16}}>
          <div style={{fontSize:9,color:T.dim,textTransform:"uppercase",letterSpacing:1.5,marginBottom:5,fontFamily:"'Lato',sans-serif",display:"flex",justifyContent:"space-between"}}>
            <span>Group Code</span>
            <button onClick={generateCode} style={{background:"transparent",border:"none",color:T.blue,fontSize:10,cursor:"pointer",fontFamily:"'Lato',sans-serif",textDecoration:"underline"}}>Generate new code</button>
          </div>
          <input value={groupCode} onChange={e=>setGroupCode(e.target.value.toUpperCase())} placeholder="e.g. SMITH or MICKEY23"
            style={{width:"100%",background:"rgba(255,255,255,.04)",border:`1px solid ${T.border}`,borderRadius:8,color:T.gold,fontSize:16,padding:"9px 12px",fontFamily:"'Cinzel',serif",letterSpacing:2,textTransform:"uppercase"}}/>
          <div style={{fontSize:10,color:T.dim,fontFamily:"'Lato',sans-serif",marginTop:4}}>Share this code with your family so they can join your group</div>
        </div>
        {!backendOnline && (
          <div style={{padding:"9px 12px",background:"rgba(255,215,0,.06)",border:`1px solid rgba(255,215,0,.2)`,borderRadius:8,marginBottom:12,fontSize:11,color:T.gold,fontFamily:"'Lato',sans-serif"}}>
            ⚠️ Backend must be running for real-time sharing. You can still use this in demo mode.
          </div>
        )}
        <button onClick={joinGroup} disabled={!myName.trim()||!groupCode.trim()} style={{width:"100%",padding:"12px",background:`linear-gradient(135deg,rgba(79,195,247,.2),rgba(105,240,174,.15))`,border:`1px solid ${T.blue}`,borderRadius:9,color:T.blue,fontFamily:"'Cinzel',serif",fontSize:13,fontWeight:700,cursor:"pointer",letterSpacing:1,opacity:(!myName.trim()||!groupCode.trim())?.4:1}}>
          📍 JOIN GROUP
        </button>
      </div>
    </div>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {/* My status */}
      <div style={{background:T.card,border:`1px solid ${T.blue}`,borderRadius:14,padding:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:11,color:T.blue,letterSpacing:1}}>📍 MY LOCATION — {myName}</div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <span style={{fontSize:9,color:T.dim,fontFamily:"'Lato',sans-serif"}}>Group: <span style={{color:T.gold,fontWeight:700}}>{groupCode}</span></span>
            <button onClick={leaveGroup} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.dim,borderRadius:7,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"'Lato',sans-serif"}}>Leave</button>
          </div>
        </div>

        {/* Area picker */}
        <div style={{marginBottom:10}}>
          <div style={{fontSize:9,color:T.dim,textTransform:"uppercase",letterSpacing:1.5,marginBottom:6,fontFamily:"'Lato',sans-serif"}}>Where are you right now?</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {areas.map(a=>(
              <button key={a} onClick={()=>setMyArea(a)} style={{
                padding:"5px 11px",borderRadius:20,cursor:"pointer",fontSize:11,fontFamily:"'Lato',sans-serif",
                border:`1px solid ${myArea===a?T.blue:T.border}`,
                background:myArea===a?"rgba(79,195,247,.12)":"transparent",
                color:myArea===a?T.blue:T.dim,fontWeight:myArea===a?700:400,
              }}>{AREA_EMOJI[a]||"📍"} {a}</button>
            ))}
          </div>
        </div>

        {/* Status picker */}
        <div style={{marginBottom:12}}>
          <div style={{fontSize:9,color:T.dim,textTransform:"uppercase",letterSpacing:1.5,marginBottom:6,fontFamily:"'Lato',sans-serif"}}>What are you doing?</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {STATUS_EMOJIS.map(s=>(
              <button key={s} onClick={()=>setMyStatus(s)} style={{
                padding:"4px 10px",borderRadius:20,cursor:"pointer",fontSize:11,fontFamily:"'Lato',sans-serif",
                border:`1px solid ${myStatus===s?T.green:T.border}`,
                background:myStatus===s?"rgba(105,240,174,.12)":"transparent",
                color:myStatus===s?T.green:T.dim,
              }}>{s}</button>
            ))}
          </div>
        </div>

        <button onClick={pushLocation} style={{width:"100%",padding:"10px",background:"rgba(79,195,247,.1)",border:`1px solid ${T.blue}`,borderRadius:8,color:T.blue,fontFamily:"'Cinzel',serif",fontSize:11,fontWeight:700,cursor:"pointer",letterSpacing:.5}}>
          📡 SHARE MY LOCATION NOW
        </button>
      </div>

      {/* Group members */}
      <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
        <div style={{padding:"10px 14px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontFamily:"'Cinzel',serif",fontSize:11,color:T.green,letterSpacing:1}}>👨‍👩‍👧 GROUP MEMBERS</span>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {lastSync && <span style={{fontSize:9,color:T.dim,fontFamily:"'Lato',sans-serif"}}>Synced {lastSync.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>}
            <button onClick={pullLocations} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.dim,borderRadius:6,padding:"2px 7px",fontSize:10,cursor:"pointer",fontFamily:"'Lato',sans-serif"}}>↺</button>
          </div>
        </div>
        {members.length === 0 ? (
          <div style={{padding:30,textAlign:"center",color:T.dim,fontFamily:"'Lato',sans-serif",fontSize:12}}>
            {backendOnline
              ? `Waiting for family to join with code "${groupCode}"…\n\nShare the code and have them open the Location tab.`
              : "Start the backend server to enable real-time location sharing."}
          </div>
        ) : members.map(m=>(
          <div key={m.memberId} style={{display:"flex",gap:12,padding:"12px 16px",borderBottom:`1px solid ${T.border}20`,alignItems:"center"}}>
            <div style={{width:38,height:38,borderRadius:"50%",background:"rgba(105,240,174,.12)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>
              {AREA_EMOJI[m.area]||"📍"}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:700,color:T.text,fontFamily:"'Lato',sans-serif"}}>{m.name}</div>
              <div style={{fontSize:11,color:T.green,fontFamily:"'Lato',sans-serif",marginTop:1}}>{m.area}</div>
              {m.status && <div style={{fontSize:11,color:T.dim,fontFamily:"'Lato',sans-serif",marginTop:1}}>{m.status}</div>}
            </div>
            <div style={{fontSize:10,color:T.dim,fontFamily:"'Lato',sans-serif",flexShrink:0,textAlign:"right"}}>
              {timeSince(m.ts)}
              <div style={{width:7,height:7,borderRadius:"50%",background:Date.now()-m.ts<60000?T.green:Date.now()-m.ts<120000?T.gold:T.dim,marginLeft:"auto",marginTop:4}}/>
            </div>
          </div>
        ))}
      </div>

      {/* Meet-up suggestor */}
      <div style={{background:"rgba(105,240,174,.06)",border:`1px solid rgba(105,240,174,.2)`,borderRadius:12,padding:"12px 16px"}}>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:10,color:T.green,letterSpacing:1,marginBottom:6}}>💡 MEET-UP TIP</div>
        <div style={{fontSize:12,color:T.text,fontFamily:"'Lato',sans-serif",lineHeight:1.6}}>
          Can't find each other? Pick a <strong style={{color:T.gold}}>landmark meet-up spot</strong> before splitting up — near Cinderella Castle flagpole, the EPCOT Spaceship Earth base, or the Tree of Life bridge. Works even without cell service.
        </div>
      </div>

      <div style={{textAlign:"center",fontSize:10,color:T.dim,fontFamily:"'Lato',sans-serif"}}>
        Updates every 15 seconds · Requires backend server for real-time sync · No GPS data stored
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function DisneyAgent() {
  const [activeTab, setActiveTab]         = useState("live");
  const [park, setPark]                   = useState("Magic Kingdom");
  const [visitDay, setVisitDay]           = useState("Saturday");
  const [rides, setRides]                 = useState([]);
  const [loading, setLoading]             = useState(false);
  const [chatLoading, setChatLoading]     = useState(false);
  const [backendOnline, setBackendOnline] = useState(null);
  const [chatMessages, setChatMessages]   = useState([]);
  const [chatHistory, setChatHistory]     = useState([]);
  const [chatInput, setChatInput]         = useState("");
  const [lastUpdate, setLastUpdate]       = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(()=>{
    fetch(`${API_BASE}/health`).then(r=>r.json()).then(()=>setBackendOnline(true)).catch(()=>setBackendOnline(false));
  },[]);

  const loadRides = useCallback(async()=>{
    if(backendOnline){
      try{
        const r=await fetch(`${API_BASE}/api/rides/${encodeURIComponent(park)}?day=${visitDay}`);
        const d=await r.json(); setRides(d.rides); setLastUpdate(new Date()); return d.rides;
      }catch{}
    }
    const local=localWaitTimes(park); setRides(local); setLastUpdate(new Date()); return local;
  },[park,visitDay,backendOnline]);

  useEffect(()=>{loadRides();},[park,visitDay,backendOnline]);
  useEffect(()=>{messagesEndRef.current?.scrollIntoView({behavior:"smooth"});},[chatMessages]);

  const sendChat=async()=>{
    if(!chatInput.trim()||chatLoading) return;
    const txt=chatInput.trim(); setChatInput("");
    setChatMessages(p=>[...p,{role:"user",content:txt,time:new Date().toLocaleTimeString()}]);
    setChatLoading(true);
    const hist=[...chatHistory,{role:"user",content:txt}];
    try{
      const reply=await callClaude(txt, backendOnline, park, visitDay, rides);
      setChatMessages(p=>[...p,{role:"agent",content:reply,time:new Date().toLocaleTimeString()}]);
      setChatHistory([...hist,{role:"assistant",content:reply}]);
    }catch(e){
      setChatMessages(p=>[...p,{role:"agent",content:`Error: ${e.message}`,time:new Date().toLocaleTimeString()}]);
    }
    setChatLoading(false);
  };

  const sortedByWait=[...rides].sort((a,b)=>a.currentWait-b.currentWait);

  const TABS=[
    {id:"live",          label:"⏱ Live Waits"},
    {id:"weather",       label:"🌤️ Weather"},
    {id:"entertainment", label:"🎭 Shows"},
    {id:"dining",        label:"🍽️ Dining"},
    {id:"location",      label:"📍 Find My Family"},
    {id:"plan",          label:"🗺️ Plan My Day"},
    {id:"recap",         label:"📖 Day Recap"},
    {id:"chat",          label:"💬 AI Chat"},
  ];

  return(
    <div style={{minHeight:"100vh",background:T.bg,color:T.text,fontFamily:"'Georgia',serif"}}>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",overflow:"hidden",zIndex:0}}>
        {[...Array(50)].map((_,i)=>(
          <div key={i} style={{position:"absolute",width:Math.random()>.8?2:1,height:Math.random()>.8?2:1,background:"white",borderRadius:"50%",left:`${Math.random()*100}%`,top:`${Math.random()*70}%`,opacity:Math.random()*.6+.1,animation:`twinkle ${2+Math.random()*3}s ease-in-out infinite`,animationDelay:`${Math.random()*3}s`}}/>
        ))}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Lato:wght@300;400;700&display=swap');
        @keyframes twinkle{0%,100%{opacity:.1}50%{opacity:.9}}
        @keyframes slideIn{from{transform:translateY(8px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(255,215,0,.4)}50%{box-shadow:0 0 0 10px rgba(255,215,0,0)}}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:#0a0a1a}::-webkit-scrollbar-thumb{background:#2a2a5a;border-radius:3px}
        .row-hover:hover{background:rgba(79,195,247,.06)!important;padding-left:22px!important;transition:all .18s}
        select option{background:#11112b}
        input::placeholder,textarea::placeholder{color:#444}
        input:focus,textarea:focus{outline:none;border-color:#4FC3F7!important}
      `}</style>

      <div style={{position:"relative",zIndex:1,maxWidth:1100,margin:"0 auto",padding:"16px 14px"}}>

        {/* Header */}
        <div style={{textAlign:"center",marginBottom:16}}>
          <div style={{fontSize:28,marginBottom:2}}>✨🏰✨</div>
          <h1 style={{fontFamily:"'Cinzel',serif",fontSize:"clamp(17px,3vw,28px)",fontWeight:900,color:T.gold,margin:0,letterSpacing:2,textShadow:"0 0 30px rgba(255,215,0,.4)"}}>DISNEY WORLD AI AGENT</h1>
          <div style={{marginTop:7,display:"inline-flex",alignItems:"center",gap:5,padding:"3px 11px",borderRadius:20,background:backendOnline===null?"rgba(136,136,170,.1)":backendOnline?"rgba(105,240,174,.1)":"rgba(255,107,157,.1)",border:`1px solid ${backendOnline===null?T.dim:backendOnline?T.green:T.pink}`}}>
            <div style={{width:5,height:5,borderRadius:"50%",background:backendOnline===null?T.dim:backendOnline?T.green:T.pink}}/>
            <span style={{fontSize:10,color:backendOnline===null?T.dim:backendOnline?T.green:T.pink,fontFamily:"'Lato',sans-serif"}}>
              {backendOnline===null?"Connecting…":backendOnline?"Backend online · Live data + Email ready":"Preview mode · Start backend for email sending"}
            </span>
          </div>
        </div>

        {/* Config bar */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:8,marginBottom:12}}>
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,padding:"9px 12px"}}>
            <div style={{fontSize:9,color:T.dim,textTransform:"uppercase",letterSpacing:2,marginBottom:3,fontFamily:"'Lato',sans-serif"}}>Park</div>
            <select value={park} onChange={e=>setPark(e.target.value)} style={{width:"100%",background:"transparent",border:"none",color:T.gold,fontSize:11,fontFamily:"'Lato',sans-serif",cursor:"pointer",fontWeight:700}}>
              {PARKS.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,padding:"9px 12px"}}>
            <div style={{fontSize:9,color:T.dim,textTransform:"uppercase",letterSpacing:2,marginBottom:3,fontFamily:"'Lato',sans-serif"}}>Visit Day</div>
            <select value={visitDay} onChange={e=>setVisitDay(e.target.value)} style={{width:"100%",background:"transparent",border:"none",color:T.gold,fontSize:12,fontFamily:"'Lato',sans-serif",cursor:"pointer"}}>
              {DAYS.map(d=><option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,padding:"9px 12px",display:"flex",flexDirection:"column",justifyContent:"center"}}>
            <div style={{fontSize:9,color:T.dim,textTransform:"uppercase",letterSpacing:2,marginBottom:3,fontFamily:"'Lato',sans-serif"}}>Live Data</div>
            <div style={{fontSize:10,color:lastUpdate?T.green:T.dim,fontFamily:"'Lato',sans-serif"}}>
              {lastUpdate?`Updated ${lastUpdate.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}`:"Loading…"}
            </div>
          </div>
          <button onClick={loadRides} disabled={loading} style={{background:"rgba(79,195,247,.08)",border:`1px solid ${T.blue}`,borderRadius:10,color:T.blue,fontSize:11,fontFamily:"'Lato',sans-serif",fontWeight:700,cursor:"pointer",padding:"9px 12px"}}>
            ↺ Refresh Waits
          </button>
        </div>

        {/* Tab bar */}
        <div style={{display:"flex",gap:6,marginBottom:14,overflowX:"auto",paddingBottom:2}}>
          {TABS.map(tab=>(
            <button key={tab.id} onClick={()=>setActiveTab(tab.id)} style={{padding:"8px 16px",borderRadius:20,border:`1px solid ${activeTab===tab.id?T.gold:T.border}`,background:activeTab===tab.id?"rgba(255,215,0,.12)":"transparent",color:activeTab===tab.id?T.gold:T.dim,fontFamily:"'Lato',sans-serif",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",transition:"all .2s",flexShrink:0}}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── LIVE WAITS ── */}
        {activeTab==="live" && (
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
              <div style={{padding:"10px 14px",borderBottom:`1px solid ${T.border}`,fontFamily:"'Cinzel',serif",fontSize:11,color:T.gold,letterSpacing:1}}>LIVE WAIT TIMES — {park}</div>
              <div style={{maxHeight:420,overflowY:"auto"}}>
                {rides.map(r=>(
                  <div key={r.id} className="row-hover" style={{display:"flex",alignItems:"center",padding:"9px 14px",borderBottom:`1px solid ${T.border}20`}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontFamily:"'Lato',sans-serif",fontWeight:700,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</div>
                      <div style={{fontSize:9,color:T.dim,fontFamily:"'Lato',sans-serif"}}>{r.area}</div>
                    </div>
                    <div style={{textAlign:"right",marginLeft:8}}>
                      <div style={{fontSize:16,fontFamily:"'Cinzel',serif",fontWeight:700,color:T[r.status]}}>{r.currentWait}</div>
                      <div style={{fontSize:8,color:T.dim,fontFamily:"'Lato',sans-serif"}}>MIN</div>
                    </div>
                    <div style={{width:6,height:6,borderRadius:"50%",background:T[r.status],marginLeft:8,flexShrink:0}}/>
                  </div>
                ))}
              </div>
            </div>
            <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
              <div style={{padding:"10px 14px",borderBottom:`1px solid ${T.border}`}}>
                <div style={{fontFamily:"'Cinzel',serif",fontSize:11,color:T.green,letterSpacing:1}}>OPTIMAL RIDE ORDER</div>
                <div style={{fontSize:9,color:T.dim,fontFamily:"'Lato',sans-serif",marginTop:1}}>Shortest → longest wait right now</div>
              </div>
              <div style={{maxHeight:420,overflowY:"auto"}}>
                {sortedByWait.map((r,i)=>(
                  <div key={r.id} className="row-hover" style={{display:"flex",alignItems:"flex-start",padding:"9px 14px",borderBottom:`1px solid ${T.border}20`}}>
                    <div style={{width:20,height:20,borderRadius:"50%",flexShrink:0,background:i<3?T.green:i<6?T.gold:T.pink,color:"#000",fontSize:9,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",marginRight:9,marginTop:1,fontFamily:"'Lato',sans-serif"}}>{i+1}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontFamily:"'Lato',sans-serif",fontWeight:700,color:T.text}}>{r.name}</div>
                      <div style={{fontSize:9,color:T.dim,fontFamily:"'Lato',sans-serif",marginTop:1,lineHeight:1.4}}>{r.tips}</div>
                    </div>
                    <div style={{fontSize:12,fontFamily:"'Cinzel',serif",fontWeight:700,color:T[r.status],marginLeft:6,flexShrink:0}}>{r.currentWait}m</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{gridColumn:"1/-1",display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap"}}>
              {[["short","< 30 min"],["moderate","30–60 min"],["long","> 60 min"]].map(([k,l])=>(
                <div key={k} style={{display:"flex",alignItems:"center",gap:4}}>
                  <div style={{width:6,height:6,borderRadius:"50%",background:T[k]}}/>
                  <span style={{fontSize:10,color:T.dim,fontFamily:"'Lato',sans-serif"}}>{l}</span>
                </div>
              ))}
              <span style={{fontSize:10,color:T.dim,fontFamily:"'Lato',sans-serif"}}>· Verify with My Disney Experience app</span>
            </div>
          </div>
        )}

        {/* ── WEATHER ── */}
        {activeTab==="weather" && <WeatherTab/>}

        {/* ── ENTERTAINMENT ── */}
        {activeTab==="entertainment" && <EntertainmentTab park={park}/>}

        {/* ── DINING ── */}
        {activeTab==="dining" && <DiningTab park={park} backendOnline={backendOnline}/>}

        {/* ── LOCATION SHARING ── */}
        {activeTab==="location" && <LocationTab park={park} backendOnline={backendOnline}/>}

        {/* ── PLAN MY DAY ── */}
        {activeTab==="plan" && <PlanMyDay rides={rides} backendOnline={backendOnline}/>}

        {/* ── DAY RECAP ── */}
        {activeTab==="recap" && <DayRecap park={park} visitDay={visitDay} backendOnline={backendOnline}/>}

        {/* ── CHAT ── */}
        {activeTab==="chat" && (
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,display:"flex",flexDirection:"column",height:520}}>
            <div style={{padding:"10px 14px",borderBottom:`1px solid ${T.border}`}}>
              <span style={{fontFamily:"'Cinzel',serif",fontSize:11,color:T.blue,letterSpacing:1}}>AI AGENT CHAT</span>
              <span style={{fontSize:10,color:T.dim,fontFamily:"'Lato',sans-serif",marginLeft:8}}>Ask anything about {park}</span>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:"10px 14px",display:"flex",flexDirection:"column",gap:8}}>
              {chatMessages.length===0&&(
                <div style={{color:T.dim,fontSize:12,fontFamily:"'Lato',sans-serif",textAlign:"center",marginTop:24}}>
                  🏰 Ask me anything!<br/><span style={{fontSize:11,opacity:.7}}>Best time for Haunted Mansion? Where to eat? Hidden gems?</span>
                </div>
              )}
              {chatMessages.map((msg,i)=>(
                <div key={i} style={{animation:"slideIn .25s ease",display:"flex",flexDirection:"column",alignItems:msg.role==="user"?"flex-end":"flex-start"}}>
                  <div style={{maxWidth:"86%",padding:"9px 13px",borderRadius:msg.role==="user"?"14px 14px 3px 14px":"14px 14px 14px 3px",background:msg.role==="user"?"rgba(255,215,0,.1)":"rgba(79,195,247,.07)",border:`1px solid ${msg.role==="user"?"rgba(255,215,0,.18)":"rgba(79,195,247,.12)"}`,fontSize:12,fontFamily:"'Lato',sans-serif",lineHeight:1.65,whiteSpace:"pre-wrap",color:T.text}}>{msg.content}</div>
                  <div style={{fontSize:9,color:T.dim,marginTop:2,fontFamily:"'Lato',sans-serif"}}>{msg.time}</div>
                </div>
              ))}
              {chatLoading&&<div style={{color:T.blue,fontSize:12,fontFamily:"'Lato',sans-serif"}}>🤔 Thinking…</div>}
              <div ref={messagesEndRef}/>
            </div>
            <div style={{padding:"10px 14px",borderTop:`1px solid ${T.border}`,display:"flex",gap:8}}>
              <textarea value={chatInput} onChange={e=>setChatInput(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendChat()}}}
                placeholder="Ask about rides, food, tips, crowds…" rows={2}
                style={{flex:1,background:"rgba(255,255,255,.03)",border:`1px solid ${T.border}`,borderRadius:9,color:T.text,fontSize:12,padding:"7px 11px",fontFamily:"'Lato',sans-serif",resize:"none",lineHeight:1.4}}/>
              <button onClick={sendChat} disabled={chatLoading} style={{background:T.gold,color:"#000",border:"none",borderRadius:9,width:40,cursor:chatLoading?"not-allowed":"pointer",fontSize:16,fontWeight:900,opacity:chatLoading?.5:1}}>→</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
