import { useEffect, useState } from "react";
import "./App.css"
// import LiveFeed from "../../my-project/src/Components/LivePositionsREST"
import TestBoard2 from "./Components/TestBoard2";

function App() {
  
  return (
    <div className="bg-white text-black flex w-screen">
      {/* <LiveFeed/> */}
      <TestBoard2/>
    </div>
  );
}

export default App;
