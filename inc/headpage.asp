<%
rs.pagesize=msg_per_page '定义分页记录集每页显示记录数

if not (rs.eof and rs.bof) then
	totalrec=rs.recordcount'总记录条数
	if rs.recordcount mod msg_per_page=0 then'计算总页数,recordcount:数据的总记录数
		n=rs.recordcount\msg_per_page'n:总页数
	else
		n=rs.recordcount\msg_per_page+1                        
	end if                                                                
	currentpage=request("page")'currentpage:当前页
	if not isnumeric(request("page")) then
		 currentpage=1
    else	
		currentpage=cint(request("page"))
 	end if
	
	if currentpage <> "" then
		currentpage =  cint(currentpage)
		if currentpage < 1 then  
			currentpage = 1
		end if  
		if err.number <> 0 then '错误处理
			err.clear
			currentpage=1
		end if
	else
		currentpage=1
	end if                                                                
	if currentpage*msg_per_page > totalrec and not((currentpage-1)*msg_per_page < totalrec)then 
		currentpage=1
	end if
	rs.absolutepage=currentpage 
	rowcount=rs.pagesize 
end if
%>